const { connectToDatabase, disconnectFromDatabase } = require("/opt/dbconnection");
const { headers } = require("/opt/common");

const { TagsSchema } = require("/opt/models");

exports.handler = async (event) => {
  console.log(event);
  switch (event.operation) {
    case "create":
      return createTag(event);
    case "readAll":
      return getTags();
    case "readOne":
      return getTagById(event.id);
    case "update":
      return updateTag(event.id);
    case "delete":
      return deleteTag(event.id);
    default:
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ message: "Invalid operation" }),
      };
  }
};

// Create operation
const createTag = async (event) => {
  let response;
  const createdTag = new TagsSchema(event.data);
  await connectToDatabase(process.env.MONGODB_URI);
  const result = await createdTag.save();
  response = {
    status: 200,
    headers: headers,
    body: JSON.stringify({ tag: result }),
  };
  await disconnectFromDatabase();
  try {
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

// Get all tags
const getTags = async () => {
  console.log("Preparing all tags");
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const allTags = await TagsSchema.find();
    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: allTags, count: allTags.length }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while finding tags: ", err }),
    };
    return response;
  }
};

/**getTagById:
 * Get one tag by the Id
 *
 * @param {String} tagId - objectId of the Tag
 * @returns {JSON} JSON response with tag in the body
 * @throws {Error} Throws an error if not able to return output (JSON)
 */
const getTagById = async (tagId) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const tag = await TagsSchema.find({ _id: tagId });
    const response = {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ result: tag }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while finding the tag", err }),
    };
    return response;
  }
};

const updateTag = async (event) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    const result = await TagsSchema.findOneAndUpdate({ _id: event.id }, event.data, { new: true });
    const response = {
      status: 200,
      body: JSON.stringify({ tag: result }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      status: 500,
      body: JSON.stringify({ message: "Something went wrong, Error while updating tag details ", err }),
    };
    return response;
  }
};

// Delete a tag by id
const deleteTag = async (tagId) => {
  try {
    await connectToDatabase(process.env.MONGODB_URI);
    await TagsSchema.deleteOne({ _id: tagId });
    const response = {
      status: 200,
      body: JSON.stringify({ message: "Tag has been deleted successfully" }),
    };
    await disconnectFromDatabase();
    return response;
  } catch (err) {
    const response = {
      status: 500,
      body: JSON.stringify({ message: "Error while deleting Tag due to ", err }),
    };
    return response;
  }
};
