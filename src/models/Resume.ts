const mongoose = require('mongoose');

const ResumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true
  },
  personalInfo: {
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    linkedIn: { type: String }, // LinkedIn URL
    portfolio: { type: String } // Portfolio/Website URL
  },
  summary: {
    type: String
  }
  // Add other sections like experience, education, skills etc. later as needed
}, {
  // Add timestamps (createdAt, updatedAt) automatically
  timestamps: true
});

module.exports = mongoose.model('Resume', ResumeSchema);
