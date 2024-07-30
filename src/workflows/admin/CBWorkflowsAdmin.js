const { connectToDatabase, disconnectFromDatabase, mongoose } = require("/opt/dbconnection");
const { headers, createErrorResponse, generatePopulateOptions, getLambdaFunctionArn } = require("/opt/common");
const { WorkflowSchema } = require("/opt/models");

const crypto = require("crypto");
const AWS = require("aws-sdk");

// Helper function specific to workflow:
/**interpolateColor:
 * receive the search score (0-1) and return a color range (blue-red) for node objects
 *
 * @param {[Float]} value - search similarity score from pineCone
 * @returns {String} String Hex code for the color
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
function interpolateColor(value) {
  value = Math.min(1, Math.max(0, value));
  const blue = [0, 0, 100];
  const red = [255, 40, 40];

  const r = 10 * Math.round(blue[0] + (red[0] - blue[0]) * 0.08 * value);
  const g = Math.round(blue[1] + (red[1] - blue[1]) * 0.04 * value);
  const b = Math.round(blue[2] + (red[2] - blue[2]) * 0.01 * value);
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  return hex;
}

// Can we use uuid instead? This is to generate hashed presigned file in S3
function generateUUID() {
  return crypto.randomBytes(16).toString("hex");
}

exports.handler = async (event) => {
  console.log(event);

  const lambda = new AWS.Lambda();
  const s3 = new AWS.S3();
  const stepfunctions = new AWS.StepFunctions();
  
  switch (event.operation) {
    case "create":
      return createWorkflow(event);
    case "readAll":
      return getWorkflows();
    case "readAllByField":
      return getWorkflowsDynamic(event);
    case "readOne":
      return getWorkflowById(event);
    case "readOneByQuery":
      return getWorkflowsByQuery(event);
    case "readOneByField":
      return getWorkflowDynamic(event);
    case "update":
      return updateWorkflow(event);
    case "delete":
      return deleteWorkflow(event);
    case "updateDiagram":
      return updateWorkflowDiagram(event);
    case "readAllWorkflowTrees":
      return getWorkflowsTreeNoRank();
    case "readAllWorkflowTreesWithRank":
      return getWorkflowsTreeWithRank(event, lambda);
    case "getObjectClass1":
      return getObjectDetectionAI(event, lambda, s3);
    case "getObjectClass":
      return getObjectClass(event, stepfunctions);
    case "chatWithEntities":
      return chatWithEntities(event, lambda);  
    default:
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ message: "Invalid operation" }),
      };
  }
};

// Consolidate Fields (This eventually needs to move to the common functions)
function consolidatePopulateOptions(populateOptions) {
  const consolidated = {};

  populateOptions.forEach((option) => {
    if (!consolidated[option.path]) {
      // If the path hasn't been added yet, add it with its select field
      consolidated[option.path] = { path: option.path, select: option.select };
    } else {
      // If the path already exists, append the select field
      consolidated[option.path].select += " " + option.select;
    }
  });

  return Object.values(consolidated);
}

/**createWorkflowBasic:
 * Create a new workflow
 *
 * @param {[JSON]} event - JSON object containing the fields to be added for new workflow
 * @returns {JSON} JSON response with the created workflow
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const createWorkflowBasic = async (event) => {
  let response;
  const createdWorkflow = new WorkflowSchema(event.data);
  await connectToDatabase(process.env.MONGODB_URI);
  const result = await createdWorkflow.save();
  response = {
    status: 200,
    headers: headers,
    body: JSON.stringify({ workflow: result }),
  };
  await disconnectFromDatabase();
  try {
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};

/**createWorkflow:
 * Create a new workflow
 *
 * @param {[JSON]} event - JSON object containing the fields to be added for new workflow
 * @returns {JSON} JSON response with the created workflow
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const createWorkflow = async (event) => {
  await connectToDatabase(process.env.MONGODB_URI);
  let childNodes = [];
  const workflowDiagram = event.data.blockDiagram;

  // Convert blockDiagram to a string
  const blockDiagram = JSON.stringify(workflowDiagram);

  try {
    childNodes = workflowDiagram.nodes
      .filter((node) => node.hasOwnProperty("workflowId"))
      .map((node) => new mongoose.Types.ObjectId(node.workflowId));
  } catch (err) {
    childNodes = [];
  }

  const createdWorkflow = new WorkflowSchema({
    ...event.data,
    childNodes,
    blockDiagram, // Add the string version of blockDiagram here
  });

  const result = await createdWorkflow.save();

  await disconnectFromDatabase();

  return {
    status: 200,
    headers: headers,
    body: JSON.stringify({ workflow: result }),
  };
};

/**getWorkflows:
 * Get all workflows
 *
 * @returns {JSON} JSON response with all workflows in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getWorkflows = async () => {
  console.log("Preparing all workflows");
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const allWorkflows = await WorkflowSchema.find();
    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: allWorkflows, count: allWorkflows.length }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};

/**getWorkflowsDynamic:
 * Get all workflows by dynamically selecting the required fields in the form
 * of a list passed to the function. The elements of the form has the format
 * of "<MODEL>.attribute". For instance "Location.address" corresponding to
 * the address field from Location model.
 *
 * @param {[String]} populateItems - List of required fields to be populated
 * @returns {JSON} JSON response with all workflows in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getWorkflowsDynamic = async (event) => {
  let populateOptions, consolidatedPopulateOptions;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    if ("data" in event && "populateItems" in event.data) {
      populateOptions = generatePopulateOptions("data" in event ? event.data.populateItems : []);
      consolidatedPopulateOptions = consolidatePopulateOptions(populateOptions);
    } else {
      consolidatedPopulateOptions = [];
    }
    const workflows = await WorkflowSchema.find({}).populate(consolidatedPopulateOptions).exec();

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: workflows }),
    };
  } catch (err) {
    const errorResponse = createErrorResponse(500, `Something went wrong: ${err.message}`);
    return errorResponse;
  }
};

const getWorkflowsByQuery = async (event) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const workflows = await WorkflowSchema.findById(event._id).populate(event.query).exec();

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: workflows }),
    };
  } catch (err) {
    const errorResponse = createErrorResponse(500, `Something went wrong: ${err.message}`);
    return errorResponse;
  }
};

/**getWorkflowById:
 * Get one workflow by the Id. If you need attributes inside the reference objects,
 * you can pass it in populateItems list e.g. ["company.companyName", "location.name"]
 *
 * @param {String} workflowId - objectId of the workflow
 * @param {String} populateItems - List of required fields to be populated
 * @returns {JSON} JSON response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getWorkflowById = async (event) => {
  try {
    const workflowId = event.data._id;
    const populateItems = event.data.populateItems;
    const populateOptions = generatePopulateOptions(populateItems);

    await connectToDatabase(process.env.MONGODB_URI);
    const workflow = await WorkflowSchema.find({ _id: workflowId }).populate(populateOptions).exec();

    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: workflow }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};

/**getWorkflowDynamic:
 * Get one Workflow by dynamically selecting the required fields in the form
 * of a list passed to the function. The elements of the form has the format
 * of "<MODEL>.attribute". For instance "Location.address" corresponding to
 * the address field from Location model.
 *
 * @param {[String]} populateItems - List of required fields to be populated
 * @returns {JSON} JSON response with all workflows in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getWorkflowDynamic = async (event) => {
  const populateItems = event.data.populateItems;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const populateOptions = generatePopulateOptions(populateItems);
    const consolidatedPopulateOptions = consolidatePopulateOptions(populateOptions);

    const workflow = await WorkflowSchema.findOne({ _id: event.data["_id"] }).populate(consolidatedPopulateOptions).exec();
    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: workflow }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while finding the workflow", err }),
    };
    return response;
  }
};

/**getWorkflowsTreeNoRank:
 * Get workflows tree for Search (Without any ranks). The workflow tree
 * is structured into the object understandable for `react-force-graph`
 * based on corresponding nodes and edges.
 * We are following the same pattern as dynamicPopulate but this time the only
 * object we are looking at in workflow schema are the array of childrens
 *
 * @returns {JSON} JSON response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getWorkflowsTreeNoRank = async () => {
  let nodes = [];
  let links = [];

  try {
    await connectToDatabase(process.env.MONGODB_URI);

    const populateItems = ["thumbnail.location"];
    const populateOptions = generatePopulateOptions(populateItems);
    const workflows = await WorkflowSchema.find({}).populate(populateOptions).exec();

    workflows.forEach((workflow) => {
      let nodeObject = {
        id: workflow._id,
        code: workflow.code,
        name: workflow.name,
        description: workflow.description,
        image: workflow.thumbnail.location,
        color: "#ffffff",
      };

      nodes.push(nodeObject);
      workflow.childNodes.forEach((child) => {
        const linksObjects = {
          source: workflow._id,
          target: child._id,
        };
        links.push(linksObjects);
      });
    });

    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        tree: {
          nodes: nodes,
          links: links,
        },
      }),
    };

    await disconnectFromDatabase();
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};

/** getWorkflowsTreeWithRank⭐⭐⭐⭐ :
 * Get workflows tree for Search with ranked results. The input of this
 * method will be a text coming from the front-end. We need to call
 * ai_service_vector_search Lambda to get the ranked values. The result
 * is transformed into a hex color code that is passed in the form of
 * node/link structure for `react-graph-force` use.
 *
 * @param {String} query - Search query send from frontend
 * @param {AWS.Lambda} lambda - Instance of AWS SDK Lambda
 * @returns {JSON} query response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getWorkflowsTreeWithRank = async (event, lambda) => {
  let nodes = [];
  let links = [];
  let query = event.data.query;

  try {
    await connectToDatabase(process.env.MONGODB_URI);

    const populateItems = ["thumbnail.location"];
    const populateOptions = generatePopulateOptions(populateItems);
    const workflows = await WorkflowSchema.find({}).populate(populateOptions).exec();

    const workflows_length = workflows.length;
    const colorObject = {};
    const scoreObject = {};
    const pinecone_query = {
      action: "SEARCH",
      search: {
        query: query,
        top_k: -1,
      },
    };

    const lambdaArn = await getLambdaFunctionArn("ai_service_vector_search", lambda);
    const functionParams = {
      FunctionName: lambdaArn,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(pinecone_query),
    };

    const lambdaResponse = await lambda.invoke(functionParams).promise();

    // this is wrong because what is stored in db is digitalentity not workflow

    if (lambdaResponse && !lambdaResponse.FunctionError && lambdaResponse.StatusCode === 200) {
      const payload = JSON.parse(lambdaResponse.Payload);
      console.log("PAYLOAD", payload);
      if (payload.statusCode == 200) {
        payload.body.forEach((digitalEntity) => {
          scoreObject[digitalEntity.id] = digitalEntity.score;
        });
      }
    }
    console.log("OBJ: ",scoreObject)

    workflows.forEach((workflow) => {
      let totalScore = 0;
      let averageScore = 0;
      let color = "#000000";
      let digitalEntities = workflow.digitalEntities;

      if (digitalEntities) {
        digitalEntities.forEach((entity) => {
          let score = scoreObject[entity._id.toString()] ? scoreObject[entity._id.toString()] : 0;
          totalScore += score;
        });
        averageScore = digitalEntities.length > 0 ? totalScore / digitalEntities.length : 0;
        color = interpolateColor(averageScore);
      }
      let nodeObject = {
        id: workflow._id,
        code: workflow.code,
        name: workflow.name,
        image: workflow.thumbnail.location,
        description: workflow.description,
        color: color,
        score: averageScore,
      };

      nodes.push(nodeObject);
      workflow.childNodes.forEach((child) => {
        const linksObjects = {
          source: workflow._id,
          target: child._id,
        };
        links.push(linksObjects);
      });
    });

    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        tree: {
          nodes: nodes,
          links: links,
        },
      }),
    };

    await disconnectFromDatabase();
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};


/** getObjectDetectionAI ⭐⭐⭐⭐:
 * Send the base64 video-stream frames to ai-service for object-detection
 *
 * @param {JSON} event - JSON object including base64 image and company_name
 * @param {AWS.Lambda} lambda - Instance of AWS SDK Lambda
 * @param {AWS.S3} s3 - Instance of AWS SDK s3
 * @returns {JSON} query response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getObjectDetectionAI = async (event, lambda, s3) => {
  const companyName = event.company_name;
  const imageObj = event.image;
  const base64Data = new Buffer.from(imageObj.replace(/^data:image\/\w+;base64,/, ""), "base64");

  // These should go to ENV variables at some point
  const contentType = "image/jpeg";
  const BUCKET_NAME = "entity360-object-detection";

  const OBJECT_KEY = `inference/${generateUUID()}.jpg`;
  const EXPIRY_TIME = 3600;

  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: OBJECT_KEY,
    Body: base64Data,
    ContentType: contentType,
    ACL: "private",
  };

  await s3.putObject(uploadParams).promise();

  // Generate pre-signed URL (May be we should move it to common layer)
  const urlParams = {
    Bucket: BUCKET_NAME,
    Key: OBJECT_KEY,
    Expires: EXPIRY_TIME,
  };

  const presignedUrl = s3.getSignedUrl("getObject", urlParams);
  const aiServicePayload = {
    image_url: presignedUrl,
    endpoint_name: `object-detection--${companyName}`,
  };
  let prediction_result;
  try {
    const lambdaArn = await getLambdaFunctionArn("ai_service_object_detection_inference", lambda);
    const functionParams = {
      FunctionName: lambdaArn,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(aiServicePayload),
    };

    const lambdaResponse = await lambda.invoke(functionParams).promise();

    if (lambdaResponse) {
      const payload = JSON.parse(lambdaResponse.Payload);
      if (payload.statusCode == 200) {
        prediction_result = JSON.parse(payload.body);
      }
    }
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        prediction_class: prediction_result["jsonapi"]["prediction_class"],
      }),
    };

    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};

/**updateWorkflow:
 * Update the workflow by Id
 *
 * @param {String} event - updated values for workflow
 * @returns {JSON} JSON response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const updateWorkflow = async (event) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const updatedWorkflow = event.data;
    const result = await WorkflowSchema.findByIdAndUpdate(event.id, updatedWorkflow, { new: true });

    await disconnectFromDatabase();

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ workflow: result }),
    };
  } catch (err) {
    return createErrorResponse(500, `Record update failed with error: ${err.message}`);
  }
};

/**updateWorkflowDiagram:
 * Update the workflow diagram by replacing and rewriting it based on the object passed in
 * event (Specifically event.diagram). The idea here is to search for `workflowId`
 * tag in the attributes and if we find any, we add it to the children array of Workflows
 * in the schema.
 *
 * @param {String} workflowId - Id of the workflow we are changing
 * @param {JSON} event - updated values for workflow
 *
 * @returns {JSON} JSON response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const updateWorkflowDiagram = async (event) => {
  const workflowId = event.data._id;
  const childNodes = [];

  // try {
  await connectToDatabase(process.env.MONGODB_URI);
  // check if any node has a workflowId and if it does, create its digital twin array:
  event.data.diagram.nodes.forEach((node) => {
    if (node.hasOwnProperty("workflowId")) {
      // childNodes.push(mongoose.Types.ObjectId(node.workflowId));
      childNodes.push(new mongoose.Types.ObjectId(node.workflowId));
    }
  });

  console.log(event.data.diagram.nodes);

  const updatedWorkflow = event.data;
  updatedWorkflow["childNodes"] = childNodes;
  updatedWorkflow["blockDiagram"] = JSON.stringify(event.data.diagram);

  // const result = await WorkflowSchema.findById(workflowId, updatedWorkflow, { new: true });
  const result = await WorkflowSchema.findByIdAndUpdate(workflowId, { $set: updatedWorkflow }, { new: true });
  await disconnectFromDatabase();

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({ workflow: result }),
  };
  // }
  // catch (err) {
  //   return createErrorResponse(500, `Record update failed with error: ${err.message}`);
  // }
};

/**deleteWorkflow:
 * delete a workflow
 *
 * @param {String} workflowId - The ID of the workflow to delete
 * @returns {JSON} JSON response with the created workflow
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const deleteWorkflow = async (event) => {
  try {
    const workflowId = event.data._id;
    await connectToDatabase(process.env.MONGODB_URI);
    const deletedWorkflow = await WorkflowSchema.findById(workflowId);
    const response = {
      status: 200,
      body: JSON.stringify({ message: `Workflow has been deleted successfully`, res: deletedWorkflow }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};


/** getObjectClass ⭐⭐⭐⭐:
 * Send the base64 video-stream frames to ai-service for object-detection
 *
 * @param {JSON} event - JSON object including base64 image and company_name
 * @param {AWS.Lambda} lambda - Instance of AWS SDK Lambda
 * @param {AWS.S3} s3 - Instance of AWS SDK s3
 * @returns {JSON} query response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getObjectClass = async (event, stepfunction) => {
  let response 
  let scoreObject = {}
        let nodes = [];
      let links = [];
  const company_id = event['data']['company_id']
  const image = event['data']['image']
  const stateARN = "arn:aws:states:us-east-1:800475964869:stateMachine:ai_service_object-detection-embedding-standard"
  let payload = {
    callType: "INFERENCE",
    image: image,
    company_id: company_id
  };

  const stepFunctionParams = {
    stateMachineArn: stateARN,
    name: "ai_object_detection_INFERENCE" + Date.now(), // Provide a unique execution name
    input: JSON.stringify(payload)
  };
  try {
    await connectToDatabase(process.env.MONGODB_URI);

    const populateItems = ["thumbnail.location"];
    const populateOptions = generatePopulateOptions(populateItems);
    const workflows = await WorkflowSchema.find({}).populate(populateOptions).exec();
    response = await stepfunction.startExecution(stepFunctionParams).promise();
    const executionArn = response.executionArn;

    await new Promise(resolve => setTimeout(resolve, 10000));
    const statusResponse = await stepfunction.describeExecution({ executionArn }).promise();

    payload = JSON.parse(statusResponse.output);
    console.log("PAYLOAD", payload);

    payload.result.forEach((physicalEntity) => {
      scoreObject[physicalEntity.object_class] = physicalEntity.max_score;
    });


    workflows.forEach((workflow) => {
      let totalScore = 0;
      let averageScore = 0;
      let color = "#000000";
      let physicalEntities = workflow.physicalEntities;

      if (physicalEntities) {
        physicalEntities.forEach((entity) => {
          let score = scoreObject[entity._id.toString()] ? scoreObject[entity._id.toString()] : 0;
          totalScore += score;
        });
        averageScore = physicalEntities.length > 0 ? totalScore / physicalEntities.length : 0;
        color = interpolateColor(averageScore);
      }
      let nodeObject = {
        id: workflow._id,
        code: workflow.code,
        name: workflow.name,
        image: workflow.thumbnail.location,
        description: workflow.description,
        color: color,
        score: averageScore,
      };

      nodes.push(nodeObject);
      workflow.childNodes.forEach((child) => {
        const linksObjects = {
          source: workflow._id,
          target: child._id,
        };
        links.push(linksObjects);
      });
    });

    response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        tree: {
          nodes: nodes,
          links: links,
        },
      }),
    };

    await disconnectFromDatabase();
    return response;
  }
  catch (err) {
    response = {
      statusCode: 400,
      headers: {},
      body: JSON.stringify({ message: "Something went wrong, Error while creating physical entity embedding", err }),
    };
    return response
  }
}



/** ChatWithEntities⭐⭐⭐⭐ :
 * Chat information from frontend including "_id" and "query"
 *
 * @param {event} query - Search query of chat
 * @param {AWS.Lambda} lambda - Instance of AWS SDK Lambda
 * @returns {JSON} query response with workflow in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const chatWithEntities = async (event, lambda) => {

  try {
    let response
    const lambdaArn = await getLambdaFunctionArn("ai_service-chatbot-digitalEntity", lambda);
    const chatPayload = {
      "_id": event['data']['_id'],
      "query": event['data']['query']
    };
    const functionParams = {
      FunctionName: lambdaArn,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(chatPayload),
    };

    const lambdaResponse = await lambda.invoke(functionParams).promise();

    // this is wrong because what is stored in db is digitalentity not workflow

    if (lambdaResponse && !lambdaResponse.FunctionError && lambdaResponse.StatusCode === 200) {
      const payload = JSON.parse(lambdaResponse.Payload);
      console.log("PAYLOAD", payload);
      if (payload.statusCode == 200) {
        response = {
          statusCode: 200,
          headers: headers,
          body: JSON.stringify({
            "response": payload.response
          })
        };
      }
    } else {
        response = {
          statusCode: 500,
          headers: headers,
          body: JSON.stringify({
            "response": "Something went wrong while accessing data"
          })
        };      
    }
    return response;
  } catch (err) {
    return createErrorResponse(500, `Something went wrong: : ${err.message}`);
  }
};