const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/userController');

// @route   POST api/users/register
// @desc    Register user
// @access  Public
router.post('/register', registerUser);

// @route   POST api/users/login
// @desc    Authenticate user (login)
// @access  Public
router.post('/login', loginUser);

module.exports = router;
