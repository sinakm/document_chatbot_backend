const { connectToDatabase, disconnectFromDatabase, mongoose } = require("/opt/dbconnection");
const { headers, getLambdaFunctionArn, generatePopulateOptions } = require("/opt/common");
const { DigitalEntitySchema, QASchema, FilesSchema } = require("/opt/models");
const AWS = require("aws-sdk");

exports.handler = async (event) => {
  const lambda = new AWS.Lambda();
  let S3 = new AWS.S3();

  switch (event.operation) {
    case "create":
      return createDigitalEntity(event, lambda);
    case "readAll":
      return getDigitalEntities();
    case "readOne":
      return getDigitalEntity(event);
    case "readOneByField":
      return getDigitalEntityDynamic(event);
    case "readAllByField":
      return getDigitalEntitiesDynamic(event);
    case "update":
      return updateDigitalEntity(event, lambda, S3);
    case "vectorizeOne":
      return vectorizeDigitalEntity(event, lambda);
    // case "delete":
    //   return deleteCompany(_id);
    default:
      return {
        statusCode: 400,
        headers: {},
        body: JSON.stringify({ message: "Invalid operation" }),
      };
  }
};

const vectorizeDigitalEntity = async (event, lambda) => {
  await connectToDatabase(process.env.MONGODB_URI);
  const digitalEntity = await DigitalEntitySchema.findOne({ _id: new mongoose.Types.ObjectId(event.id) });
  try {
    //const digitalEntity = await DigitalEntitySchema.findOne({ _id: new mongoose.Types.ObjectId(event.id) });
    console.log("Step 1 - ENTITY FOUND");

    const pineconePayload = {
      action: "UPSERT",
      doc: {
        _id: digitalEntity._id,
        title: digitalEntity.name,
        description: digitalEntity.description,
        sentences: digitalEntity.documentSentences || [],
        registrationNumber: digitalEntity.registrationNumber,
      },
    };

    const lambdaArn = await getLambdaFunctionArn("ai_service_vector_search", lambda);
    console.log("Step 2 - PINECONE PAYLOAD");

    const functionParams = {
      FunctionName: lambdaArn,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(pineconePayload),
    };

    const lambdaResponse = await lambda.invoke(functionParams).promise();
    console.log("Step 3 - PINECONE LAMBDA RESPONSE:", lambdaResponse);

    if (lambdaResponse.FunctionError || !JSON.parse(lambdaResponse.Payload).statusCode == 200) {
      throw new Error("Vector upsert failed.");
    }

    const lambdaArnQA = await getLambdaFunctionArn("ai_service_qa_generator", lambda);
    const QA_functionParams = {
      FunctionName: lambdaArnQA,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({ text: digitalEntity.documentFullText }),
    };

    const QAlambdaResponse = await lambda.invoke(QA_functionParams).promise();
    console.log("Step 4 - Q&A GENERATOR RESPONSE:", QAlambdaResponse);

    if (QAlambdaResponse.FunctionError || !JSON.parse(QAlambdaResponse.Payload).statusCode == 200) {
      throw new Error("QA generation failed.");
    }

    const QAPayload = JSON.parse(QAlambdaResponse.Payload);
    const update = {
      $set: {
        qas: QAPayload.body,
        question: "RANDOM TEXT",
      },
    };
    const options = { upsert: true, new: true };
    const updatedQA = await QASchema.findOneAndUpdate({ document: digitalEntity._id }, update, options);
    console.log("Step 5 - Q&A Updated in DB");

    digitalEntity.trainingStatus = "succesfull";
    digitalEntity.questions = [updatedQA._id];
    await digitalEntity.save();
  } catch (err) {
    console.error("Error occurred:", err);
    digitalEntity.trainingStatus = "failed";
    await digitalEntity.save();
    await disconnectFromDatabase();
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "An error occurred during processing", error: err.message }),
    };
  }

  await disconnectFromDatabase();
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: "Updated successfully", digitalEntityId: event.id }),
  };
};

// const vectorizeDigitalEntity = async (event, lambda) => {
//   let response;
//   const lambdaArn = await getLambdaFunctionArn("ai_service_vector_search", lambda);
//     await connectToDatabase(process.env.MONGODB_URI);

//     const digitalEntity = await DigitalEntitySchema.findOne({ _id: new mongoose.Types.ObjectId(event.id) });
//     console.log("Step 1 - ENTITY FOUND");
//     let status = digitalEntity["trainingStatus"] || "N/A";

//     const pineconePayload = {
//       action: "UPSERT",
//       doc: {
//         _id: digitalEntity._id,
//         title: digitalEntity.name,
//         description: digitalEntity.description,
//         sentences: digitalEntity["documentSentences"] || [],
//         registrationNumber: digitalEntity.registrationNumber,
//       },
//     };
//     console.log("Step 2 - PINECONE PAYLOAD");

//     const functionParams = {
//       FunctionName: lambdaArn,
//       InvocationType: "RequestResponse",
//       Payload: JSON.stringify(pineconePayload),
//     };

//     const lambdaResponse = await lambda.invoke(functionParams).promise();
//     console.log("Step 3 - PINECONE LAMBDA RESPONSE:");
//     if (lambdaResponse && !lambdaResponse.FunctionError) {
//       const payload = JSON.parse(lambdaResponse.Payload);
//       status = payload.statusCode == 200 ? "succesfull" : "failed";
//     }

//     // CALLING QA MODEL:
//     const lambdaArnQA = await getLambdaFunctionArn("ai_service_qa_generator", lambda);
//     const QA_functionParams = {
//       FunctionName: lambdaArnQA,
//       InvocationType: "RequestResponse",
//       Payload: JSON.stringify({ text: digitalEntity.documentFullText })
//     };
//     const QAlambdaResponse = await lambda.invoke(QA_functionParams).promise();
//     console.log("Step 4 - Q&A GENERATOR RESPONSE:");

//   try {

//     if (QAlambdaResponse) {
//       const QAPayload = JSON.parse(QAlambdaResponse.Payload);
//       if (QAPayload.statusCode == 200) {
//         const QAParams = {
//           document: digitalEntity._id,
//           qas: QAPayload.body,
//           question: "GENERATED BY AI",
//         };
//           const createdQA = new QASchema(QAParams);
//           const QAresult = await createdQA.save();
//           response = {
//             status: 200,
//             headers: headers,
//             body: JSON.stringify({ digitalEntity: digitalEntity, qa: QAresult }),
//           };
//           console.log("Step 6 - Response", response)
//         try {

//           console.log("Step 5 - Q&A Stored in DB")
//         } catch (err) {
//           status = "failed";
//         }
//       } else {
//         status = "failed";
//       }
//     } else {
//       status = "failed";
//     }

//     await DigitalEntitySchema.findOneAndUpdate({ _id: digitalEntity._id }, { trainingStatus: status });
//     await disconnectFromDatabase();
//     response = {
//       status: 200,
//       headers: {}, // Define your headers here if needed
//       body: JSON.stringify({ message: "Updated successfully", digitalEntityId: digitalEntity._id }),
//     };
//     console.log("FINAL RESPONSE: ", response);
//     return response;

//   } catch (err) {
//       response = {
//         statusCode: 400,
//         headers: {},
//         body: JSON.stringify({ message: "Something went wrong, Error while vectorizing digitalEntity", err }),
//       };
//     return response;
//   }
// };

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

const getDigitalEntities = async () => {
  let response;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const digitalEntities = await DigitalEntitySchema.find();
    response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: digitalEntities, count: digitalEntities.length }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    response = {
      statusCode: 400,
      headers: {},
      body: JSON.stringify({ message: "Something went wrong, Error while finding entities", err }),
    };
    return response;
  }
};

const getDigitalEntity = async (event) => {
  let response;

  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const digitalEntity = await DigitalEntitySchema.findOne({ _id: new mongoose.Types.ObjectId(event.id) });
    const qa = await QASchema.findOne({ document: event.id });
    response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ digitalEntity: digitalEntity, qa: qa }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    response = {
      statusCode: 400,
      headers: {},
      body: JSON.stringify({ message: "Something went wrong, Error while finding entities", err }),
    };
    return response;
  }
};

/**getDigitalEntityDynamic:
 * Get one digitalEntity by dynamically selecting the required fields in the form
 * of a list passed to the function. The elements of the form has the format
 * of "<MODEL>.attribute". For instance "Location.address" corresponding to
 * the address field from Location model.
 *
 * @param {[String]} populateItems - List of required fields to be populated
 * @returns {JSON} JSON response with all workflows in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getDigitalEntityDynamic = async (event) => {
  const populateItems = event.data.populateItems;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const populateOptions = generatePopulateOptions(populateItems);
    const consolidatedPopulateOptions = consolidatePopulateOptions(populateOptions);

    const user = await DigitalEntitySchema.findOne({ _id: event["id"] }).populate(consolidatedPopulateOptions).exec();
    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: user }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while finding the user", err }),
    };
    return response;
  }
};

/**getDigitalEntitiesDynamic:
 * Get all DigitalEntities by dynamically selecting the required fields in the form
 * of a list passed to the function. The elements of the form has the format
 * of "<MODEL>.attribute". For instance "Location.address" corresponding to
 * the address field from Location model.
 *
 * @param {[String]} populateItems - List of required fields to be populated
 * @returns {JSON} JSON response with all workflows in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getDigitalEntitiesDynamic = async (event) => {
  const populateItems = event.data.populateItems;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const populateOptions = generatePopulateOptions(populateItems);
    const consolidatedPopulateOptions = consolidatePopulateOptions(populateOptions);

    const allEntities = await DigitalEntitySchema.find({}).populate(consolidatedPopulateOptions).exec();

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: allEntities }),
    };
  } catch (err) {
    const response = {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while finding the user", err }),
    };
    return response;
  }
};

const filePreprocessing = async (file, lambdaArn) => {
  const fileProcessParams = {
    id: file._id,
    S3Object: {
      Bucket: process.env.bucket_name,
      Name: file.name,
    },
  };
  return {
    FunctionName: lambdaArn,
    InvocationType: "RequestResponse", // Change this if you want a different invocation type
    Payload: JSON.stringify(fileProcessParams), // Pass event data to the other Lambda function
  };
};

const createDigitalEntity = async (request, lambda) => {
  let response, OCRlambdaResponse;

  try {
    const lambdaArn = await getLambdaFunctionArn("ocr_service_textextract", lambda);
    OCRlambdaResponse = await lambda.invoke(await filePreprocessing(request.data.file, lambdaArn)).promise();

    if (OCRlambdaResponse.StatusCode == 200) {
      const OCRpayload = JSON.parse(OCRlambdaResponse.Payload);
      request.data.documentFullText = OCRpayload.body.full_text;
      request.data.documentSentences = OCRpayload.body.sentence_list;
      request.data.file = request.data.file._id;
      try {
        const createdDigitalEntity = new DigitalEntitySchema(request.data);
        await connectToDatabase(process.env.MONGODB_URI);
        const result = await createdDigitalEntity.save();
        response = {
          status: 200,
          headers: headers,
          body: JSON.stringify({ digitalEntity: result, qa: result }),
        };
      } catch (err) {
        response = {
          statusCode: 400,
          headers: headers,
          body: JSON.stringify({ message: "Something went wrong, Error while creating digital entity", err }),
        };
        return response;
      }
    } else {
      response = {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ message: "Error while file preprocessing", Error: OCRlambdaResponse }),
      };
    }
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    response = {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ message: "Internal Server Error, Error while file preprocessing", err }),
    };
    return response;
  }
};

// const updateDigitalEntity = async (request, lambda, S3) => {
//   let response, lambdaResponse, file;

//   try {
//     await connectToDatabase(process.env.MONGODB_URI);

//     //ocr
//     if ("filename" in request.data) {
//       file = await FilesSchema.findOne({ _id: request.data.file });
//       console.log(file);
//       const lambdaArn = await getLambdaFunctionArn("ocr_service_textextract", lambda);
//       lambdaResponse = await lambda.invoke(await filePreprocessing(file, lambdaArn)).promise();

//       const payload = JSON.parse(lambdaResponse.Payload);
//       if (payload.statusCode == 200) {
//         request.data.documentFullText = payload.body.full_text;
//         request.data.documentSentences = payload.body.sentence_list;
//         await deleteFile(S3, request);
//       } else {
//         return (response = {
//           statusCode: 400,
//           headers: headers,
//           body: JSON.stringify({ message: "Error while file preprocessing" }),
//         });
//       }
//     }
//     const result = await DigitalEntitySchema.findOneAndUpdate({ _id: request.id }, request.data);

//     console.log("result", result);

//     response = {
//       status: 200,
//       headers: headers,
//       body: JSON.stringify({ message: "Updated successfully", digitalEntity: result }),
//     };
//     await disconnectFromDatabase();
//   } catch (err) {
//     response = {
//       statusCode: 400,
//       headers: headers,
//       body: JSON.stringify({ message: "Something went wrong, Error while creating digital entity", err }),
//     };
//   }
//   return response;
// };

const deleteFile = async (S3, request) => {
  const obj = {
    Bucket: process.env.bucket_name,
    Key: request.filename,
  };

  try {
    await S3.deleteObject(obj).promise();
    try {
      await FilesSchema.deleteOne({ name: request.filename });
      return {
        statusCode: 200,
      };
    } catch (err) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ message: "Error while deleting from file scehma" }),
      };
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Error while deleting deleting file from s3" }),
    };
  }
};
