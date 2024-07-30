const mongoose = require("mongoose");

let connection = null;

async function connectToDatabase(URL) {
  if (connection && mongoose.connection.readyState === 1) {
    console.log("Using existing database connection");
    return;
  }

  console.log("Creating new database connection");

  connection = await mongoose.connect(URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  return connection;
}

async function disconnectFromDatabase() {
  if (connection) {
    console.log("Closing database connection");
    await mongoose.disconnect();
    connection = null;
  }
  return connection;
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  mongoose,
};
