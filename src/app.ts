// Load environment variables from .env file first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express'; // Use import syntax
import connectDB from './config/db'; // Use import syntax
import userRoutes from './routes/userRoutes'; // Use import syntax
import resumeRoutes from './routes/resumeRoutes'; // Use import syntax
import templateRoutes from './routes/templateRoutes'; // Import template routes

// Connect to Database
connectDB(); // Make sure DB connection happens after dotenv is loaded if DB URI is in .env

const app = express();

// Init Middleware to parse JSON body
app.use(express.json());

// Define Routes
// Basic route for testing
app.get('/', (req: express.Request, res: express.Response) => res.send('API Running - Base Route')); // Added types

// Mount User Routes
app.use('/api/users', userRoutes);

// Mount Resume Routes
app.use('/api/resumes', resumeRoutes);

// Mount Template Routes
app.use('/api/templates', templateRoutes);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

// Export the app instance for potential testing or extension
export default app; // Use export default syntax
