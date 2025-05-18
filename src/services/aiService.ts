const axios = require('axios');

// Retrieves the API URL and Key from environment variables
const LLAMA_API_URL = process.env.LLAMA_API_URL;
const LLAMA_API_KEY = process.env.LLAMA_API_KEY;

/**
 * Sends a prompt to the placeholder AI service and returns the response.
 * @param {string} prompt - The prompt to send to the AI service.
 * @returns {Promise<object>} - The data part of the AI service's response.
 * @throws {Error} - Throws an error if the API call fails or if env vars are missing.
 */
const analyzeResumePrompt = async (prompt) => {
  if (!LLAMA_API_URL || !LLAMA_API_KEY) {
    console.error('AI Service Error: Missing LLAMA_API_URL or LLAMA_API_KEY in environment variables.');
    throw new Error('AI Service configuration is incomplete.');
  }

  try {
    console.log(`Sending prompt to AI service at ${LLAMA_API_URL}...`);
    const response = await axios.post(
      LLAMA_API_URL,
      { prompt }, // Assuming the API expects the prompt in a JSON body like { "prompt": "..." }
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLAMA_API_KEY}`,
        },
        timeout: 15000 // Add a timeout (e.g., 15 seconds)
      }
    );

    console.log('AI service responded successfully.');
    // Assuming the relevant response data is in response.data
    // Modify this based on the actual API response structure
    return response.data;

  } catch (error) {
    console.error('AI Service Error:', error.response ? error.response.data : error.message);
    // More specific error handling based on status code if needed
    if (error.response) {
        throw new Error(`AI Service request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
        // The request was made but no response was received
        throw new Error('AI Service did not respond.');
    } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`Error setting up AI Service request: ${error.message}`);
    }
  }
};

module.exports = {
  analyzeResumePrompt,
};
