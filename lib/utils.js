const { CfnAuthorizer, LambdaIntegration, RestApi, Model, Cors } = require("aws-cdk-lib/aws-apigateway");
const { Code, LayerVersion, Function } = require("aws-cdk-lib/aws-lambda");
const { Policy, PolicyStatement, Effect } = require("aws-cdk-lib/aws-iam");

const createLayer = (thisKeyword, name, path, runtime, description) => {
  return new LayerVersion(thisKeyword, name, {
    code: Code.fromAsset(path),
    compatibleRuntimes: runtime,
    description: description,
  });
};

const createLambdaFunction = (thisKeyword, name, runtime, handler, path, layers, timeout, region, role, env) => {
  return new Function(thisKeyword, name, {
    runtime: runtime,
    handler: handler,
    code: Code.fromAsset(path),
    layers: layers,
    timeout: timeout,
    region: region,
    role: role,
    environment: env,
  });
};

const createApi = (thisKeyword, apiName, description, mediaType) => {
  if (mediaType) {
    return new RestApi(thisKeyword, apiName, {
      restApiName: apiName,
      description: description,
      binaryMediaTypes: ["multipart/form-data"],
      // defaultCorsPreflightOptions: {
      //   allowOrigins: Cors.ALL_ORIGINS,
      //   allowMethods: Cors.ALL_METHODS, // this will also enable pre-flight OPTIONS requests
      // },
    });
  } else {
    return new RestApi(thisKeyword, apiName, {
      restApiName: apiName,
      description: description,
      // defaultCorsPreflightOptions: {
      //   allowOrigins: Cors.ALL_ORIGINS,
      //   allowMethods: Cors.ALL_METHODS, // this will also enable pre-flight OPTIONS requests
      // },
    });
  }
};

const createApiAuthorizer = (thisKeyword, name, restApiId, type, source, arns) => {
  return new CfnAuthorizer(thisKeyword, name, {
    restApiId: restApiId,
    name: name,
    type: type,
    identitySource: source,
    providerArns: arns,
  });
};

const createApiResource = (resource, method, lambdaFunction, api, authType, apiAuthorizer) => {
  let apiMethod;
  const apiResource = api.root.addResource(resource);
  apiResource.addCorsPreflight({
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS, // this will also enable pre-flight OPTIONS requests
  });

  if (authType && authType.length > 0) {
    // Create the API Gateway method
    apiMethod = apiResource.addMethod(method, new LambdaIntegration(lambdaFunction), {
      authorizationType: authType,
      authorizer: {
        authorizerId: apiAuthorizer.ref,
      },
      proxy: true,
    });
  } else {
    // Create the API Gateway method
    apiMethod = apiResource.addMethod(method, new LambdaIntegration(lambdaFunction), {
      proxy: false,
    });
  }

  // Add method response with status 200 and response body as application/json
  apiMethod.addMethodResponse({
    statusCode: "200",
    responseParameters: {
      "method.response.header.Content-Type": true,
    },
    responseModels: {
      "application/json": Model.EMPTY_MODEL, // Use apigateway.Model.EMPTY_MODEL for empty response model
    },
  });

  return { apiResource, apiMethod };
};

const createLambdaPolicy = (thisKeyword, policyName) => {
  return new Policy(thisKeyword, policyName, {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "lambda:*",
          "cloudwatch:*",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "cognito-idp:*",
          "cognito-identity:*",
        ], // Adjust permissions as needed
        resources: ["*"], // Limit resource scope as needed
      }),
      // Add more statements as needed
    ],
  });
};

module.exports = { createLayer, createLambdaFunction, createApi, createApiAuthorizer, createApiResource, createLambdaPolicy };
