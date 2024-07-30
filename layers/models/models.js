const mongoose = require("mongoose");

const Schema = mongoose.Schema;

// ✅ Ready to use
// 🟨 Not started
// 🟧 Not complete

// ✅ Files Schema (Images used for non-search purposes e.g. thumbnails, user profiles, logos, etc.)
const fileSchema = new Schema({
  name: {
    type: String,
  },
  type: {
    type: String,
  },
  size: {
    type: Number,
  },
  location: {
    type: String,
  },
  status: {
    type: String,
    default: "ACTIVE",
  },
  owner: {
    type: String,
  },
  createdAt: {
    type: String,
  },
  updatedAt: {
    type: String,
  },
  createdBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
  ],
  updatedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
  ],
});

// ✅ DigitalEntity Schema (Documents and PDF's used i n search and workflows)
const digitalEntitySchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  documentSentences: {
    type: Array,
    required: false,
  },
  documentFullText: {
    type: String,
    required: false,
  },
  file: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Files",
    required: true,
  },
  questions: { type: String, required: false },
  version: { type: String, required: false },
  registrationNumber: {
    type: String,
    required: true,
  },
  tags: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tags",
      required: false,
    },
  ],
  trainingStatus: {
    type: String,
    enum: ["N/A", "in-progress", "succesfull", "failed"],
    default: "N/A",
  },
});

// ✅  Workflow Schema (Used for workflow builder and search)
const workflowSchema = new Schema({
  code: {
    // e.g. WI-019
    type: String,
    required: true,
  },
  name: {
    // e.g. Working with CNC Machinery
    type: String,
    required: true,
  },
  version: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    require: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  site: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
    },
  ],
  locations: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
    },
  ],
  blockDiagram: {
    type: String,
    required: false,
  },
  childNodes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workflow",
      required: false,
    },
  ],
  digitalEntities: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DigitalEntity",
      required: false,
    },
  ],
  physicalEntities: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PhysicalEntity",
      required: false,
    },
  ],
  thumbnail: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Files",
    required: false,
  },
  tags: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tags",
      required: false,
    },
  ],
});

// ✅ Tags
const tagSchema = new Schema({
  tagName: {
    type: String,
    required: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  site: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
    },
  ],
});

// ✅ Users
const userSchema = new Schema({
  employeeNumber: {
    type: String,
    required: false,
  },
  name: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: false,
  },
  address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Address",
    required: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  site: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
    },
  ],
});

const DigitalEntitySchema = mongoose.model("DigitalEntity", digitalEntitySchema);
const WorkflowSchema = mongoose.model("Workflow", workflowSchema);
const FileSchema = mongoose.model("Files", fileSchema);
const TagSchema = mongoose.model("Tags", tagSchema);
const UserSchema = mongoose.model("Users", userSchema);

module.exports = {
  FileSchema,
  DigitalEntitySchema,
  WorkflowSchema,
  TagSchema,
  UserSchema,
};
