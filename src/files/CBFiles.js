const { connectToDatabase, disconnectFromDatabase } = require("/opt/dbconnection");
const { headers, parseImages } = require("/opt/common");
let aws = require("aws-sdk");
const { FilesSchema } = require("/opt/models");

exports.handler = async (event) => {
  let response,
    result,
    consolidatedResponse = [];

  let S3 = new aws.S3();

  const generateFileParamsForS3 = (file) => {
    if (file.contentType.includes("image/")) {
      return {
        Body: file.content,
        Key: "images/" + Date.now() + "--" + file.filename,
        // ContentType: file.contentType,
        Bucket: event.queryStringParameters.bucket_name,
        ACL: "public-read",
      };
    } else {
      return {
        Body: file.content,
        Key: Date.now() + "--" + file.filename,
        // ContentType: file.contentType,
        Bucket: event.queryStringParameters.bucket_name,
        ACL: "public-read",
      };
    }
  };

  try {
    const parsedData = await parseImages(event);
    try {
      await connectToDatabase(process.env.MONGODB_URI);

      const uploadPromises = parsedData.files.map(async (file) => {
        const fileParamsForS3 = generateFileParamsForS3(file);

        const uploadedImage = await S3.upload(fileParamsForS3).promise();
        const fileParams = {
          name: uploadedImage.key,
          type: file.contentType,
          size: Buffer.byteLength(file.content) / (1024 * 1024),
          createdAt: Date.now(),
          location: uploadedImage.Location,
        };

        const createdFile = new FilesSchema(fileParams);
        result = await createdFile.save();
        consolidatedResponse.push(result);
      });
      await Promise.all(uploadPromises);
      await disconnectFromDatabase();
      return (response = {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ message: "File uploaded", result: consolidatedResponse }),
      });
    } catch (err) {
      return (response = {
        statusCode: 500,
        headers: headers,
        body: JSON.stringify({ message: "Something went wrong, Error while uploading image file", err }),
      });
    }
  } catch (err) {
    return (response = {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ message: "Something went wrong, Error while parsing image file", err }),
    });
  }
};
