const AWS = require("aws-sdk");
const { headers, getLambdaFunctionArn } = require("/opt/common");

exports.handler = async (event) => {
  const lambda = new AWS.Lambda();

  const functionParams = (lambdaArn) => {
    return {
      FunctionName: lambdaArn,
      InvocationType: "RequestResponse", // Change this if you want a different invocation type
      Payload: JSON.stringify(event), // Pass event data to the other Lambda function
    };
  };

  try {
    // code for validation user role
    switch (event.role) {
      case "ADMIN":
        const lambdaArn = await getLambdaFunctionArn("CBDigitalEntityAdmin", lambda);
        return await lambda.invoke(functionParams(lambdaArn)).promise();
      case "ENGINEER":
        return console.log("Engineer");
      default:
        return {
          statusCode: 400,
          headers: headers,
          body: JSON.stringify({ message: "Invalid role" }),
        };
    }
  } catch (error) {
    console.error(event);
    throw error;
  }
};
