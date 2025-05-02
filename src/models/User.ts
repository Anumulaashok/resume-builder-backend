const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    // Basic email format validation (optional but good practice)
    match: [/.+\@.+\..+/, 'Please fill a valid email address']
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String
    // Required is not specified, so leaving it optional
  }
}, {
  // Add timestamps (createdAt, updatedAt) automatically
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
