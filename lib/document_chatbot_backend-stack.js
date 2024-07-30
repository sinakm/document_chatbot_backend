const { Stack } = require("aws-cdk-lib");
const { Runtime } = require("aws-cdk-lib/aws-lambda");
const { createLayer } = require("./utils");
const CBDigitalEntityStack = require("./DigitalEntity/CBDigitalEntityStack");
const CBSignInStack = require("./SignIn/CBSignInStack");
const CBSignUpStack = require("./SignUp/CBSignUpStack");
const CBFilesStack = require("./Files/CBFiles");
const CBUsersStack = require("./Users/CBUsersStack");
const CBTagsStack = require("./Tags/CBTagsStack");
const CBWorkflowsStack = require("./Workflows/CBWorkflowsStack");
const CBChatbotStack = require("./Chabot/CBChatbotStack");

class DocumentChatbotBackendStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // Create the Mongoose layer
    const dbConnectionLayer = createLayer(
      this,
      "dbconnection",
      "layers/dbconnection",
      [Runtime.NODEJS_16_X],
      "db connection layer"
    );

    // Create the schema layer
    const dbSchemaLayer = createLayer(this, "models", "layers/models", [Runtime.NODEJS_16_X], "mongoose schema layer");

    // Create the common functions layer
    const commonFuncLayer = createLayer(this, "common", "layers/common", [Runtime.NODEJS_16_X], "common functions layer");

    const layers = {
      dbConnectionLayer: dbConnectionLayer,
      dbSchemaLayer: dbSchemaLayer,
      commonFuncLayer: commonFuncLayer,
    };

    new CBDigitalEntityStack.CBDigitalEntityStack(this, "CBDigitalEntityStack", layers);

    new CBSignInStack.CBSignInStack(this, "CBSignInStack", layers);

    new CBSignUpStack.CBSignUpStack(this, "CBSignUpStack", layers);

    new CBFilesStack.CBFilesStack(this, "CBFilesStack", layers);

    new CBUsersStack.CBUsersStack(this, "CBUsersStack", layers);

    new CBTagsStack.CBTagsStack(this, "CBTagsStack", layers);

    new CBWorkflowsStack.CBWorkflowsStack(this, "CBWorkflowsStack", layers);

    new CBChatbotStack.CBChatbotStack(this, "CBChatbotStack", layers);
  }
}

module.exports = { DocumentChatbotBackendStack };
