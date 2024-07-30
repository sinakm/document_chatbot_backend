const AWS = require("aws-sdk");
const { getLambdaFunctionArn } = require("/opt/common");

exports.handler = async (event) => {
  const lambda = new AWS.Lambda();
  const cognito = new AWS.CognitoIdentityServiceProvider({ region: process.env.AWS_REGION });
  console.log("event", event);

  try {
    // code for validation user role
    switch (event.operation) {
      case "signup":
        return await signup(event, cognito, lambda);
      case "confirmSignup":
        return await confirmSignup(event, cognito);
      case "resendCode":
        return await resendConfirmationCode(event, cognito);
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Invalid Operation" }),
        };
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const signup = async (event, cognito, lambda) => {
  const userAttributes = [
    { Name: "email", Value: event.data.email },
    { Name: "given_name", Value: event.data.name },
    { Name: "family_name", Value: event.data.lastName },
    // Add custom attributes if you have defined any.
    // { Name: 'custom_attribute_name', Value: 'custom_value' },
  ];
  const params = {
    ClientId: process.env.clientId,
    Password: event.data.password,
    Username: event.data.email,
    UserAttributes: userAttributes,
  };

  const createUserParams = (lambdaArn) => {
    const obj = {
      operation: "create",
      data: event.data,
    };
    return {
      FunctionName: lambdaArn,
      InvocationType: "RequestResponse", // Change this if you want a different invocation type
      Payload: JSON.stringify(obj), // Pass event data to the other Lambda function
    };
  };

  try {
    const response = await cognito.signUp(params).promise();
    if (response) {
      delete event.data.password;
      const lambdaArn = await getLambdaFunctionArn("usersAdmin", lambda);
      console.log("lambdaARN", lambdaArn);
      await lambda.invoke(createUserParams(lambdaArn)).promise();
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ result: response }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};

const confirmSignup = async (event, cognito) => {
  const params = {
    ClientId: process.env.clientId,
    ConfirmationCode: event.body.confirmationCode,
    Username: event.body.email,
  };

  try {
    await cognito.confirmSignUp(params).promise();
    return {
      statusCode: 200,
    };
  } catch (err) {
    return {
      statusCode: 401,
      body: JSON.stringify(err),
    };
  }
};

const resendConfirmationCode = async (event, cognito) => {
  const params = {
    ClientId: process.env.clientId,
    Username: event.body.email,
  };

  try {
    const response = await cognito.resendConfirmationCode(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: response }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};
