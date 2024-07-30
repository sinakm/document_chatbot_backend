const { Stack, Duration, CfnOutput } = require("aws-cdk-lib");
const { Runtime } = require("aws-cdk-lib/aws-lambda");
const { createLambdaFunction, createApiAuthorizer, createApi, createApiResource, createLambdaPolicy } = require("../utils.js");
const CBChatbotAdminStack = require("./CBChatbotAdminStack.js");
const { Role, ServicePrincipal } = require("aws-cdk-lib/aws-iam");

class CBChatbotStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const { dbConnectionLayer, dbSchemaLayer, commonFuncLayer } = props;

    // Create an IAM role for Lambda
    const lambdaRole = new Role(this, "LambdaFullAccessRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    // Create a custom policy with the required permissions
    const lambdaPolicy = createLambdaPolicy(this, "LambdaFullAccessPolicy");

    // Attach the custom policy to the Lambda role
    lambdaRole.attachInlinePolicy(lambdaPolicy);

    // Create the Lambda function
    const CBChatbotLambda = createLambdaFunction(
      this,
      "CBChatbotLambda",
      Runtime.NODEJS_16_X,
      "CBChatbot.handler",
      "src/chatbot/root",
      [dbConnectionLayer, dbSchemaLayer, commonFuncLayer],
      Duration.seconds(30),
      "us-east-1",
      lambdaRole,
      {
        MONGODB_URI: "mongodb+srv://user:A1b2c3d4e5@smartinventory.4t7kh2d.mongodb.net/chatbot",
        clientId: "4e2o38p5ifs9b0e93eo6o54r08",
        userPoolId: "us-east-1_I7YngRj8y",
        bucket_name: "cbdigitalentites",
      }
    );

    // Create the API Gateway
    const api = createApi(this, "CBChatbotApiGateway", "Endpoint for basic lambda function");

    // Create the cognito Authorizer for API gateways
    const apiAuthorizer = createApiAuthorizer(
      this,
      "apiAuthorizer",
      api.restApiId,
      "COGNITO_USER_POOLS",
      "method.request.header.Authorization",
      ["arn:aws:cognito-idp:us-east-1:800475964869:userpool/us-east-1_I7YngRj8y"]
    );

    // Create the API Gateway resource
    const resource = createApiResource("cbchatbot", "POST", CBChatbotLambda, api, "COGNITO_USER_POOLS", apiAuthorizer);

    new CBChatbotAdminStack.CBChatbotAdminStack(this, "CBChatbotAdminStack", props);

    //Output the URLs for hitting the Lambda functions
    new CfnOutput(this, "CBChatbotURL", {
      value: api.urlForPath(resource.path),
    });
  }
}

module.exports = { CBChatbotStack };
