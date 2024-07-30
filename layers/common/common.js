const parser = require("lambda-multipart-parser");

const headers = () => {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Credentials": "true",
  };
};

const parseImages = async (image) => {
  return await parser.parse(image);
};

const getLambdaFunctionArn = async function (lambdaFunctionName, lambda) {
  const params = {
    FunctionVersion: "ALL",
  };

  const results = await lambda.listFunctions(params).promise();

  for (let i = 0; i < results.Functions.length; ++i) {
    const lambdaFunction = results.Functions[i];
    // match function by CDK defined lambda function name
    if (lambdaFunction.FunctionName.includes(lambdaFunctionName)) {
      return lambdaFunction.FunctionArn;
    }
  }

  // throw exception if ARN is not found
  throw new Error(`Unable to find AWS Lambda ARN for function name '${lambdaFunctionName}'`);
};

// Receive an array of items in form of <MODEL>.attribute and construct the path/select object
const generatePopulateOptions = (populateItems) => {
  return populateItems.map((item) => {
    const [modelName, attribute] = item.split(".");
    return {
      path: modelName,
      select: attribute,
    };
  });
};

const createErrorResponse = (statusCode, errorMessage) => {
  return {
    statusCode: statusCode,
    headers: headers,
    body: JSON.stringify({ message: errorMessage }),
  };
};

module.exports = {
  headers,
  parseImages,
  getLambdaFunctionArn,
  createErrorResponse,
  generatePopulateOptions,
};
