const { connectToDatabase, disconnectFromDatabase } = require("/opt/dbconnection");
const { headers } = require("/opt/common");

const { TagsSchema } = require("/opt/models");

exports.handler = async (event) => {
  console.log(event);
  switch (event.operation) {
    case "create":
      return chat(event);
    // case "readAll":
    //   return getTags();
    // case "readOne":
    //   return getTagById(event.id);
    // case "update":
    //   return updateTag(event.id);
    // case "delete":
    //   return deleteTag(event.id);
    default:
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ message: "Invalid operation" }),
      };
  }
};

// Create operation
const chat = async (event) => {
  let response;
  try {
    const createdTag = new TagsSchema(event.data);
    await connectToDatabase(process.env.MONGODB_URI);
    const result = await createdTag.save();
    response = {
      status: 200,
      headers: headers,
      body: JSON.stringify({ tag: result }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    response = {
      status: 500,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while creating tag due to ", err }),
    };
    return response;
  }
};
