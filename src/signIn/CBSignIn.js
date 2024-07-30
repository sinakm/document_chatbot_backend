const AWS = require("aws-sdk");

exports.handler = async (event) => {
  const cognito = new AWS.CognitoIdentityServiceProvider({ region: process.env.AWS_REGION });

  try {
    switch (event.challengeName) {
      case "associate":
        return await associateSoftwareToken(event, cognito);
      case "associate_by_token":
        return await associateTOTPByToken(event,cognito);
      case "verify":
        return await verifySoftwareToken(event, cognito);
      case "USER_PASSWORD_AUTH":
        return await USER_PASSWORD_AUTH(event, cognito);
      case "SOFTWARE_TOKEN_MFA":
        return await SOFTWARE_TOKEN_MFA(event, cognito);
      case "REFRESH_TOKEN":
        return await REFRESH_TOKEN(event, cognito);
      case "reset_password":
        return await resetPassword(event, cognito);
      case "change_password":
        return await changePassword(event, cognito);
      case "confirm_reset_password":
        return await confirmResetPassword(event, cognito);
      case "describe_user_pool":
        return await describeUserPool(event, cognito);
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Invalid Challenge Name" }),
        };
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const associateSoftwareToken = async (event, cognito) => {
  const params = {
    Session: event.session,
  };

  try {
    // Authenticate the user
    const result = await cognito.associateSoftwareToken(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};

const associateTOTPByToken = async (event, cognito) => {
  const params = {
    AccessToken: event['AccessToken']
  };

  try {
    // Authenticate the user
    const response = await cognito.associateSoftwareToken(params).promise();
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

const verifySoftwareToken = async (event, cognito) => {
  const params = {
    Session: event.session,
    UserCode: event.userCode,
  };

  try {
    // Authenticate the user
    const result = await cognito.verifySoftwareToken(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};

const USER_PASSWORD_AUTH = async (event, cognito) => {
  const authParams = {
    AuthFlow: event.challengeName,
    ClientId: process.env.clientId,
    AuthParameters: {
      USERNAME: event.email,
      PASSWORD: event.password,
    },
  };

  try {
    const result = await cognito.initiateAuth(authParams).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};

const SOFTWARE_TOKEN_MFA = async (event, cognito) => {
  const respondToAuthChallengeParams = {
    ChallengeName: event.challengeName,
    ClientId: process.env.clientId,
    ChallengeResponses: {
      USERNAME: event.email,
      SOFTWARE_TOKEN_MFA_CODE: event.code,
      SESSION: event.session,
    },
    Session: event.session,
  };

  try {
    const result = await cognito.respondToAuthChallenge(respondToAuthChallengeParams).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};

const REFRESH_TOKEN = async (event, cognito) => {
  const authParams = {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: process.env.clientId,
    AuthParameters: {
      REFRESH_TOKEN: event.refreshToken,
    },
  };

  try {
    const result = await cognito.initiateAuth(authParams).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: error }),
    };
  }
};

const resetPassword = async (event, cognito) => {
  var params = {
    ClientId: process.env.clientId,
    Username: event.email,
  };
  try {
    const result = await cognito.forgotPassword(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error }),
    };
  }
};

const changePassword = async (event, cognito) => {
  const params = {
    AccessToken: event.accessToken, // The access token of the signed-in user
    PreviousPassword: event.oldPassword,
    ProposedPassword: event.newPassword
  };

  try {
    const result = await cognito.changePassword(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: "Password changed successfully" }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error.message }),
    };
  }
};

const confirmResetPassword = async (event, cognito) => {
  var params = {
    ClientId: process.env.clientId,
    ConfirmationCode: event.confirmationCode,
    Password: event.password,
    Username: event.email,
  };
  try {
    const result = await cognito.confirmForgotPassword(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error }),
    };
  }
};

const describeUserPool = async (event, cognito) => {
  var params = {
    UserPoolId: process.env.userPoolId,
  };
  try {
    const result = await cognito.describeUserPool(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ result: result }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error }),
    };
  }
};
