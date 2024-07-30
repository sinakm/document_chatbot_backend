const AWS = require("aws-sdk");
const { connectToDatabase, disconnectFromDatabase } = require("/opt/dbconnection");
const { headers, createErrorResponse, generatePopulateOptions, getLambdaFunctionArn } = require("/opt/common");
const { UsersSchema } = require("/opt/models");

exports.handler = async (event) => {
  const lambda = new AWS.Lambda();

  switch (event.operation) {
    case "create":
      return createUser(event, lambda);
    case "readAll":
      return getUsers();
    case "readAllByCondition":
      return getUsersByCondition(event.query);
    case "readAllByField":
      return getAllUsersDynamic(event);
    case "readOne":
      return getUserById(event.data.id);
    case "readOneByField":
      return getUserByIdDynamic(event);
    case "getCurrentUser":
      return getCurrentUser(event);
    case "update":
      return updateUser(event.id, event.data);
    case "delete":
      return deleteUser(event.data.id);
    default:
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ message: "Invalid operation" }),
      };
  }
};

// Get current users:
function base64UrlDecode(str) {
  // Convert Base64-URL to Base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad string with '=' characters to make the Base64 string length a multiple of 4
  let padLength = 4 - (base64.length % 4);
  if (padLength < 4) {
    for (let i = 0; i < padLength; i++) {
      base64 += "=";
    }
  }
  // Decode Base64 string to UTF-8
  let jsonPayload = decodeURIComponent(
    Buffer.from(base64, "base64")
      .toString()
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );

  return jsonPayload;
}

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

// Create operation
const createUser = async (event) => {
  let response;
  const createdUser = new UsersSchema(event.data);
  await connectToDatabase(process.env.MONGODB_URI);
  const result = await createdUser.save();
  response = {
    status: 200,
    headers: headers,
    body: JSON.stringify({ user: result }),
  };
  await disconnectFromDatabase();
  try {
    return response;
  } catch (err) {
    response = {
      status: 500,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while creating user due to ", err }),
    };
    return response;
  }
};

// Get all users
const getUsers = async () => {
  console.log("Preparing all users");
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const allUsers = await UsersSchema.find();
    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: allUsers, count: allUsers.length }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while finding users: ", err }),
    };
    return response;
  }
};

/**getCurrentUser:
 * Get current user by token
 *
 * @param {String} userId - objectId of the user
 * @returns {JSON} JSON response with user in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getCurrentUser = async (event) => {
  const token = event["data"]["token"];
  const parts = token.split(".");
  const payload = base64UrlDecode(parts[1]);
  const payloadObj = JSON.parse(payload);

  // Assuming the payload contains an 'email' field
  const email = payloadObj.email;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const user = await UsersSchema.findOne({ email: email });
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

/**getUserById:
 * Get one user by the Id
 *
 * @param {String} userId - objectId of the user
 * @returns {JSON} JSON response with user in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getUserById = async (userId) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const user = await UsersSchema.findOne({ _id: userId });
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

/**getUserByIdDynamic:
 * Get one user by the Id
 *
 * @param {String} userId - objectId of the user
 * @returns {JSON} JSON response with user in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getUserByIdDynamic = async (event) => {
  const populateItems = event.data.populateItems;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const populateOptions = generatePopulateOptions(populateItems);
    const consolidatedPopulateOptions = consolidatePopulateOptions(populateOptions);

    const user = await UsersSchema.findOne({ _id: event["id"] }).populate(consolidatedPopulateOptions).exec();
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

/**getAllUsersDynamic:
 * Get all users by dynamically selecting the required fields in the form
 * of a list passed to the function. The elements of the form has the format
 * of "<MODEL>.attribute". For instance "Location.address" corresponding to
 * the address field from Location model.
 *
 * @param {[String]} populateItems - List of required fields to be populated
 * @returns {JSON} JSON response with all workflows in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getAllUsersDynamic = async (event) => {
  const populateItems = event.data.populateItems;
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const populateOptions = generatePopulateOptions(populateItems);
    const consolidatedPopulateOptions = consolidatePopulateOptions(populateOptions);

    console.log("POP", populateOptions);
    const users = await UsersSchema.find({}).populate(consolidatedPopulateOptions).exec();

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ users: users }),
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

const getUsersByCondition = async (query) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const user = await UsersSchema.findOne(query);
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

const updateUser = async (id, userData) => {
  await connectToDatabase(process.env.MONGODB_URI);
  console.log("ID IS: ", id);
  const updatedUser = await UsersSchema.findOneAndUpdate({ _id: id }, userData, { new: true });
  const response = {
    status: 200,
    body: JSON.stringify({ result: updatedUser }),
  };
  await disconnectFromDatabase();
  return response;
  // catch (err) {
  //   const response = {
  //     status: 500,
  //     body: JSON.stringify({ message: "Something went wrong, Error while updating user details ", err }),
  //   };
  //   return response;
  // }
};

// Delete a user by id
const deleteUser = async (userId) => {
  try {
    await connectToDatabase();
    const deleteUser = await UsersSchema.deleteOne({ _id: userId });
    const response = {
      status: 200,
      body: JSON.stringify({ message: "User has been deleted successfully", result: deleteUser }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      status: 500,
      body: JSON.stringify({ message: "Error while deleting user due to ", err }),
    };
    return response;
  }
};
