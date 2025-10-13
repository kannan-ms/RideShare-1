// --- Backend: server.js ---
// This is the complete and final backend server file for your RideShare app.
// It includes all routes, models, and validations built so far.

// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { check, validationResult } = require('express-validator');
const path = require('path');

// Import new models
const ProviderDetails = require('./models/ProviderDetails');
const RiderDetails = require('./models/RiderDetails');
const Ride = require('./models/Ride');
const RideOtp = require('./models/RideOtp');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Atlas connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- User Model (Mongoose Schema) ---
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    age: { type: Number, required: true },
    mobileNumber: { type: String, required: true, unique: true },
    role: { type: String, enum: ['rider', 'provider'], default: 'rider' },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

const User = mongoose.model('User', UserSchema);

// --- JWT Secret ---
const JWT_SECRET = process.env.JWT_SECRET;

// --- Dummy Data for Verification (Simulating Parivahan API, etc.) ---
const dummyVerificationData = {
    rc: {
        'DL12AB1234': { isValid: true, ownerName: 'John Doe' },
        'UP56CD5678': { isValid: false, ownerName: 'Jane Smith' },
    },
    insurance: {
        'INS987654321': { isValid: true, policyHolder: 'John Doe' },
        'INS123456789': { isValid: false, policyHolder: 'Jane Smith' },
    },
    license: {
        'DL9876543210': { isValid: true, name: 'John Doe', dob: '1990-05-15', validity: '2030-05-15' },
        'DL0123456789': { isValid: false, name: 'Jane Smith', dob: '1985-11-20', validity: '2020-11-20' },
    },
    aadhar: {
        '123456789012': { isValid: true, name: 'John Doe' },
        '987654321098': { isValid: true, name: 'Jane Smith' },
        '111122223333': { isValid: false, name: 'Fake User' },
    }
};

// (Removed) OCR simulation and related code

// --- Routes ---

// 1. User Registration
app.post(
    '/api/auth/register',
    [
        check('name', 'Name is required').not().isEmpty(),
        check('email', 'Please include a valid email').isEmail(),
        check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
        check('password', 'Password must contain at least one uppercase letter, one lowercase letter, and one number').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/),
        check('gender', 'Gender is required and must be Male, Female, or Other').isIn(['Male', 'Female', 'Other']),
        check('age', 'Age is required and must be a number between 18 and 100').isInt({ min: 18, max: 100 }),
        check('mobileNumber', 'Mobile number is required and must be 10 digits').isLength({ min: 10, max: 10 }).isNumeric(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { name, email, password, gender, age, mobileNumber } = req.body;
        try {
            let user = await User.findOne({ $or: [{ email }, { mobileNumber }] });
            if (user) {
                return res.status(400).json({ message: 'User with this email or mobile number already exists.' });
            }
            user = new User({ name, email, password, gender, age, mobileNumber });
            await user.save();
            const payload = {
                user: { id: user.id, role: user.role }
            };
            jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' },
                (err, token) => {
                    if (err) {
                        console.error('JWT sign error:', err.message);
                        return res.status(500).json({ message: 'Token generation failed.' });
                    }
                    res.status(201).json({ 
                        message: 'User registered successfully', 
                        token,
                        userRole: user.role,
                        user: { id: user.id, name: user.name, email: user.email, role: user.role }
                    });
                }
            );
        } catch (err) {
            console.error('Registration error:', err.message);
            res.status(500).json({ message: 'Server error during registration.' });
        }
    }
);

// 2. User Login
app.post('/api/auth/login',
    [
        check('email', 'Please include a valid email').isEmail(),
        check('password', 'Password is required').exists(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { email, password } = req.body;
        try {
            let user = await User.findOne({ email });
            if (!user) {
                return res.status(400).json({ message: 'Invalid credentials.' });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials.' });
            }
            const payload = {
                user: { id: user.id, role: user.role }
            };
            jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' },
                (err, token) => {
                    if (err) {
                        console.error('JWT sign error:', err.message);
                        return res.status(500).json({ message: 'Token generation failed.' });
                    }
                    res.json({ 
                        message: 'Login successful', 
                        token, 
                        userRole: user.role,
                        user: { id: user.id, name: user.name, email: user.email, role: user.role } 
                    });
                }
            );
        } catch (err) {
            console.error('Login error:', err.message);
            res.status(500).json({ message: 'Server error during login.' });
        }
    }
);

// 3. Middleware to verify JWT token (for protected routes)
function auth(req, res, next) {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
}

// 3. Get User Profile (Token validation)
app.get('/api/auth/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(user);
    } catch (err) {
        console.error('Get user profile error:', err.message);
        res.status(500).json({ message: 'Server error fetching user profile.' });
    }
});

// 5. Update User Role
app.put('/api/auth/role', auth, async (req, res) => {
    const { role } = req.body;
    if (!['rider', 'provider'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified. Must be "rider" or "provider".' });
    }
    try {
        let user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        user.role = role;
        await user.save();
        res.json({ message: `Role updated to ${role}`, newRole: user.role });
    } catch (err) {
        console.error('Update role error:', err.message);
        res.status(500).json({ message: 'Server error updating role.' });
    }
});

// --- Provider Details Routes ---

app.post('/api/provider/details', auth, async (req, res) => {
    const {
        vehicleCategory, vehicleNumber, rcNumber, insuranceNumber, licenseNumber, aadharNumber,
        vehicleType, vehiclePhotoUrl, rcPhotoUrl, insurancePhotoUrl,
        licensePhotoUrl, aadharPhotoUrl, isPreviouslyUsedVehicle, livePhotoUrl
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
        return res.status(403).json({ message: 'Access denied. Only providers can add details.' });
    }
    if (!vehicleCategory || !['Car', 'Bike'].includes(vehicleCategory)) {
        return res.status(400).json({ message: 'Vehicle category is required and must be "Car" or "Bike".' });
    }
    if (vehicleCategory === 'Car' && !vehicleType) {
        return res.status(400).json({ message: 'Vehicle type is required for cars.' });
    }
    if (!insuranceNumber) {
        return res.status(400).json({ message: 'Insurance number is required.' });
    }
    try {
        const rcVerified = dummyVerificationData.rc[rcNumber]?.isValid || false;
        const insuranceVerified = dummyVerificationData.insurance[insuranceNumber]?.isValid || false;
        const aadharVerified = dummyVerificationData.aadhar[aadharNumber]?.isValid || false;
        // Set licenseVerified using dummy data only; OCR removed
        const licenseVerified = !!(
            dummyVerificationData.license[licenseNumber]?.isValid &&
            dummyVerificationData.license[licenseNumber]?.name === user.name
        );
        const detailsFields = {
            user: req.user.id, vehicleCategory, vehicleNumber, rcNumber, insuranceNumber, licenseNumber, aadharNumber,
            vehicleType: vehicleCategory === 'Car' ? vehicleType : undefined, vehiclePhotoUrl, rcPhotoUrl, insurancePhotoUrl,
            licensePhotoUrl, aadharPhotoUrl, livePhotoUrl, isPreviouslyUsedVehicle, rcVerified, insuranceVerified, licenseVerified, aadharVerified
        };
        let providerDetails = await ProviderDetails.findOneAndUpdate({ user: req.user.id }, { $set: detailsFields }, { new: true, upsert: true });
        res.status(201).json({ message: 'Provider details updated successfully', providerDetails });
    } catch (err) {
        console.error('Provider details save/update error:', err.message);
        res.status(500).json({ message: 'Server error saving provider details.' });
    }
});

app.get('/api/provider/details', auth, async (req, res) => {
    try {
        const providerDetails = await ProviderDetails.findOne({ user: req.user.id });
        if (!providerDetails) {
            return res.status(404).json({ message: 'Provider details not found.' });
        }
        res.json(providerDetails);
    } catch (err) {
        console.error('Get provider details error:', err.message);
        res.status(500).json({ message: 'Server error fetching provider details.' });
    }
});

// Public (limited) provider details by userId for riders to view after posting/booking rides
// @route   GET /api/provider/public/:userId
// @access  Private (any authenticated user)
app.get('/api/provider/public/:userId', auth, async (req, res) => {
    try {
        const providerDetails = await ProviderDetails.findOne({ user: req.params.userId }).select('vehicleCategory vehicleNumber rcNumber insuranceNumber licenseNumber aadharNumber vehicleType');
        if (!providerDetails) {
            return res.status(404).json({ message: 'Provider details not found.' });
        }
        // Return limited non-image info; images are omitted for privacy
        res.json({ providerDetails });
    } catch (err) {
        console.error('Get public provider details error:', err.message);
        res.status(500).json({ message: 'Server error fetching provider details.' });
    }
});

// --- Provider Rides Routes (Corrected) ---

// @route   GET /api/provider/rides
// @desc    Get all rides created by the authenticated provider
// @access  Private (Provider role required)
app.get('/api/provider/rides', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
        return res.status(403).json({ message: 'Access denied. Only providers can view their rides.' });
    }
    try {
        const rides = await Ride.find({ provider: req.user.id }).populate('riders.user', 'name mobileNumber');
        res.json({ rides });
    } catch (err) {
        console.error('Get provider rides error:', err.message);
        res.status(500).json({ message: 'Server error fetching provider rides.' });
    }
});

// @route   DELETE /api/provider/rides/:rideId
// @desc    Delete a ride created by the authenticated provider if not started/completed
// @access  Private (Provider role required)
app.delete('/api/provider/rides/:rideId', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
        return res.status(403).json({ message: 'Access denied. Only providers can delete rides.' });
    }
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found.' });
        }
        if (ride.provider.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You are not allowed to delete this ride.' });
        }
        if (ride.status === 'started' || ride.status === 'completed') {
            return res.status(400).json({ message: 'Ride cannot be deleted after it has started or completed.' });
        }
        // Instead of hard delete, mark as canceled so riders can see notifications
        const recipients = ride.riders
            .filter(r => ['pending', 'accepted'].includes(r.status))
            .map(r => r.user);
        const message = 'This ride was canceled by the provider.';
        ride.notifications.push({ message, toRiderIds: recipients });
        ride.status = 'canceled';
        await ride.save();
        return res.json({ message: 'Ride canceled and riders notified.' });
    } catch (err) {
        console.error('Delete ride error:', err.message);
        return res.status(500).json({ message: 'Server error deleting ride.' });
    }
});


// --- Rider Details Routes ---

app.post('/api/rider/details', auth, async (req, res) => {
    const { aadharNumber, mobileNumber, aadharPhotoUrl, livePhotoUrl } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'rider') {
        return res.status(403).json({ message: 'Access denied. Only riders can add details.' });
    }
    try {
        const aadharVerified = dummyVerificationData.aadhar[aadharNumber]?.isValid || false;
        const detailsFields = {
            user: req.user.id, aadharNumber, mobileNumber, aadharPhotoUrl, livePhotoUrl, aadharVerified
        };
        let riderDetails = await RiderDetails.findOneAndUpdate(
            { user: req.user.id }, { $set: detailsFields }, { new: true, upsert: true }
        );
        if (!riderDetails) {
            riderDetails = new RiderDetails(detailsFields);
            await riderDetails.save();
        }
        res.status(201).json({ message: 'Rider details saved successfully', riderDetails });
    } catch (err) {
        console.error('Rider details save/update error:', err.message);
        res.status(500).json({ message: 'Server error saving rider details.' });
    }
});

app.get('/api/rider/details', auth, async (req, res) => {
    try {
        const riderDetails = await RiderDetails.findOne({ user: req.user.id });
        if (!riderDetails) {
            return res.status(404).json({ message: 'Rider details not found.' });
        }
        res.json(riderDetails);
    } catch (err) {
        console.error('Get rider details error:', err.message);
        res.status(500).json({ message: 'Server error fetching rider details.' });
    }
});

// --- Ride Management Routes (Corrected) ---

// @route   POST /api/rides/create
// @desc    Create a new ride (Provider only)
// @access  Private (Requires Provider role)
app.post('/api/rides/create', auth, async (req, res) => {
    const { vehicleCategory, startPoint, destination, breakLocations, startTime, endTime, rideCost, womenOnly, seats } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
        return res.status(403).json({ message: 'Access denied. Only providers can create rides.' });
    }
    if (!startPoint || !destination || !startTime || !rideCost) {
        return res.status(400).json({ message: 'Start point, destination, start time, and ride cost are required.' });
    }
    try {
        const providerDetails = await ProviderDetails.findOne({ user: req.user.id });
        if (!providerDetails) {
            return res.status(400).json({ message: 'Please complete your provider details before creating a ride.' });
        }
        const newRide = new Ride({
            provider: req.user.id,
            vehicleCategory: providerDetails.vehicleCategory,
            startPoint,
            destination,
            breakLocations,
            startTime,
            endTime,
            rideCost,
            womenOnly,
            seats: Math.max(1, Math.min(6, Number(seats) || 1))
        });
        await newRide.save();
        res.status(201).json({ message: 'Ride created successfully', ride: newRide });
    } catch (err) {
        console.error('Ride creation error:', err.message);
        res.status(500).json({ message: 'Server error creating ride.' });
    }
});

// @route   POST /api/ride (Backward compatibility)
// @desc    Create a new ride (Provider only)
// @access  Private (Requires Provider role)
app.post('/api/ride', auth, async (req, res) => {
    const { vehicleCategory, startPoint, destination, breakLocations, startTime, endTime, rideCost, womenOnly, seats } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
        return res.status(403).json({ message: 'Access denied. Only providers can create rides.' });
    }
    if (!startPoint || !destination || !startTime || !rideCost) {
        return res.status(400).json({ message: 'Start point, destination, start time, and ride cost are required.' });
    }
    try {
        const providerDetails = await ProviderDetails.findOne({ user: req.user.id });
        if (!providerDetails) {
            return res.status(400).json({ message: 'Please complete your provider details before creating a ride.' });
        }
        const newRide = new Ride({
            provider: req.user.id,
            vehicleCategory: vehicleCategory || providerDetails.vehicleCategory,
            startPoint,
            destination,
            breakLocations: breakLocations || [],
            startTime: new Date(startTime),
            endTime: endTime ? new Date(endTime) : undefined,
            rideCost: parseFloat(rideCost),
            womenOnly: womenOnly || false,
            seats: Math.max(1, Math.min(6, Number(seats) || 1))
        });
        await newRide.save();
        res.status(201).json({ message: 'Ride created successfully', ride: newRide });
    } catch (err) {
        console.error('Ride creation error:', err.message);
        res.status(500).json({ message: 'Server error creating ride.' });
    }
});

// @route   GET /api/rides/search
// @desc    Search for available rides (Rider only)
// @access  Private (Requires Rider role)
app.get('/api/rides/search', auth, async (req, res) => {
    const { startPoint, destination } = req.query;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'rider') {
        return res.status(403).json({ message: 'Access denied. Only riders can search for rides.' });
    }
    if (!startPoint || !destination) {
        return res.status(400).json({ message: 'Start point and destination are required for searching.' });
    }
    try {
        const rides = await Ride.find({
            startPoint: new RegExp(startPoint, 'i'),
            destination: new RegExp(destination, 'i'),
            status: 'created'
        })
        .populate('provider', 'name mobileNumber')
        .select('-riders -liveLocation');
        res.json({ message: 'Rides found', rides });
    } catch (err) {
        console.error('Ride search error:', err.message);
        res.status(500).json({ message: 'Server error searching for rides.' });
    }
});

// @route   GET /api/rides
// @desc    Get all available rides (All authenticated users can view)
// @access  Private (Any authenticated user)
app.get('/api/rides', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        return res.status(403).json({ message: 'Access denied.' });
    }
    try {
        const now = new Date();
        let query = { status: 'created', startTime: { $gt: now } };
        
        // Filter women-only rides based on user gender
        if (user.gender !== 'Female') {
            query.womenOnly = { $ne: true };
            console.log('Filtering out women-only rides for user gender:', user.gender);
        } else {
            console.log('Showing all rides including women-only for female user');
        }
        
        const rides = await Ride.find(query)
        .populate('provider', 'name mobileNumber')
        .select('-riders -liveLocation')
        .sort({ createdAt: -1 });
        res.json({ rides });
    } catch (err) {
        console.error('Get rides error:', err.message);
        res.status(500).json({ message: 'Server error fetching rides.' });
    }
});

// @route   POST /api/rides/book/:rideId
// @desc    Book a ride (Rider only)
// @access  Private (Requires Rider role)
app.post('/api/rides/book/:rideId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'rider') {
            return res.status(403).json({ message: 'Only riders can request to book a ride.' });
        }
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found.' });
        }
        
        // Check if ride is women-only and user is not female
        if (ride.womenOnly && user.gender !== 'Female') {
            return res.status(403).json({ message: 'This ride is for women only.' });
        }
        
        const acceptedCount = ride.riders.filter(r => r.status === 'accepted').length;
        if (ride.seats && acceptedCount >= ride.seats) {
            return res.status(400).json({ message: 'Ride is full.' });
        }
        const isAlreadyRider = ride.riders.some(r => r.user.toString() === req.user.id);
        if (isAlreadyRider) {
            return res.status(400).json({ message: 'You have already requested/joined this ride.' });
        }
        ride.riders.push({
            user: req.user.id,
            status: 'pending',
        });
        await ride.save();
        res.json({ message: 'Ride request sent to provider', rideId: ride.id });
    } catch (err) {
        console.error('Ride booking error:', err.message);
        res.status(500).json({ message: 'Server error booking ride.' });
    }
});

// --- Requests & Messaging style endpoints ---
// Provider: list pending requests for their rides
app.get('/api/provider/requests', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'provider') {
            return res.status(403).json({ message: 'Only providers can view ride requests.' });
        }
        // Include both pending and accepted riders so providers can manage OTPs for accepted passengers
        const rides = await Ride.find({ provider: req.user.id, 'riders.status': { $in: ['pending', 'accepted', 'in-ride', 'started'] } })
            .populate('riders.user', 'name mobileNumber')
            .sort({ createdAt: -1 });
        // Flatten to request items, but first fetch any active (unverified) OTPs so the UI can avoid re-generating
        const requests = [];

        // Collect ride ids for an efficient OTP lookup
        const rideIds = rides.map(r => r.id);
        // Find all unverified OTPs for these rides
        const activeOtps = await RideOtp.find({ rideId: { $in: rideIds }, isVerified: false }).lean();
        const otpSet = new Set(activeOtps.map(o => `${o.rideId}_${o.passengerId}`));

        rides.forEach(ride => {
            ride.riders.forEach(r => {
                // include pending, accepted, in-ride and started so providers continue to see and manage past accepted/started rides
                if (['pending','accepted','in-ride','started'].includes(r.status)) {
                    const key = `${ride.id}_${r.user.id}`;
                    requests.push({
                        rideId: ride.id,
                        startPoint: ride.startPoint,
                        destination: ride.destination,
                        startTime: ride.startTime,
                        rider: { id: r.user.id, name: r.user.name, mobileNumber: r.user.mobileNumber },
                        status: r.status,
                        otpGenerated: otpSet.has(key),
                    });
                }
            });
        });
        res.json({ requests });
    } catch (err) {
        console.error('Provider requests error:', err.message);
        res.status(500).json({ message: 'Server error fetching requests.' });
    }
});

// Provider: accept a request
app.post('/api/provider/requests/:rideId/:riderId/accept', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'provider') {
            return res.status(403).json({ message: 'Only providers can accept requests.' });
        }
        const { rideId, riderId } = req.params;
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found.' });
        if (ride.provider.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized for this ride.' });
        }
        const riderEntry = ride.riders.find(r => r.user.toString() === riderId && r.status === 'pending');
        if (!riderEntry) return res.status(404).json({ message: 'Pending request not found.' });
        riderEntry.status = 'accepted';
        // Persist change first
        await ride.save();

        // Automatically generate OTP for this accepted passenger and send via in-app notification
        try {
            // remove any previous unverified OTPs
            await RideOtp.deleteMany({ rideId: rideId, passengerId: riderId, isVerified: false });
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            const otpHash = await bcrypt.hash(otp, 10);
            const rideOtp = new RideOtp({ otpHash, rideId: rideId, passengerId: riderId, providerId: req.user.id });
            await rideOtp.save();
            const message = `Your boarding OTP is: ${otp}`;
            ride.notifications.push({ message, toRiderIds: [riderId] });
            await ride.save();
            console.debug(`Generated OTP event for ride ${rideId} passenger ${riderId}`);
        } catch (otpErr) {
            console.error('Error generating OTP on accept:', otpErr?.message || otpErr);
        }

        res.json({ message: 'Request accepted and OTP sent to passenger', rideId, riderId });
    } catch (err) {
        console.error('Accept request error:', err.message);
        res.status(500).json({ message: 'Server error updating request.' });
    }
});

// ---------------------- OTP Endpoints ----------------------
// Generate OTP for a particular rider of a ride (Provider only)
app.post('/api/otp/generate', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'provider') {
            return res.status(403).json({ message: 'Only providers can generate OTPs.' });
        }
        const { rideId, passengerId } = req.body || {};
        if (!rideId || !passengerId) {
            return res.status(400).json({ message: 'rideId and passengerId are required.' });
        }
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found.' });
        if (ride.provider.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized for this ride.' });

        // Ensure passenger is accepted for this ride
        const riderEntry = ride.riders.find(r => r.user.toString() === passengerId && r.status === 'accepted');
        if (!riderEntry) return res.status(400).json({ message: 'Passenger is not accepted for this ride.' });

        // Generate secure 4-digit numeric OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // Hash OTP using bcrypt
        const otpHash = await bcrypt.hash(otp, 10);

        // Save to RideOtp collection (upsert pattern: remove previous OTPs for same ride/passenger)
        await RideOtp.deleteMany({ rideId, passengerId, isVerified: false });
        const rideOtp = new RideOtp({ otpHash, rideId, passengerId, providerId: req.user.id });
        await rideOtp.save();

        // Send OTP via in-app notification to the passenger (do not return OTP in API)
        const message = `Your boarding OTP is: ${otp}`;
        ride.notifications.push({ message, toRiderIds: [passengerId] });
        await ride.save();

    // For debugging only: log generation event (do not print OTP in logs)
    console.debug(`Generated OTP event for ride ${rideId} passenger ${passengerId}`);

        return res.json({ message: 'OTP generated and sent to passenger (in-app).' });
    } catch (err) {
        console.error('Generate OTP error:', err.message);
        return res.status(500).json({ message: 'Server error generating OTP.' });
    }
});

// Verify OTP (typically called by provider when passenger boards)
app.post('/api/otp/verify', auth, async (req, res) => {
    try {
        const { rideId, passengerId, otp } = req.body || {};
        if (!rideId || !passengerId || !otp) {
            return res.status(400).json({ message: 'rideId, passengerId and otp are required.' });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found.' });

        // Allow verify if requester is provider of this ride or the passenger themself
        if (req.user.id !== ride.provider.toString() && req.user.id !== passengerId) {
            return res.status(403).json({ message: 'Not authorized to verify this OTP.' });
        }

        // Try to atomically increment attempts only if attempts < 3 and not verified
        const updated = await RideOtp.findOneAndUpdate(
            { rideId, passengerId, isVerified: false, attempts: { $lt: 3 } },
            { $inc: { attempts: 1 } },
            { new: true }
        );

        if (!updated) {
            // Could be not found or already exhausted attempts
            const maybe = await RideOtp.findOne({ rideId, passengerId });
            if (!maybe) return res.status(404).json({ message: 'No active OTP found for this ride/passenger.' });
            if (maybe.isVerified) return res.status(400).json({ message: 'OTP already verified.' });
            // attempts might be >=3
            const riderEntry = ride.riders.find(r => r.user.toString() === passengerId);
            if (riderEntry) riderEntry.status = 'rejected';
            ride.notifications.push({ message: 'A passenger was rejected due to repeated invalid OTP attempts.', toRiderIds: [passengerId] });
            await ride.save();
            return res.status(403).json({ message: 'Maximum OTP attempts exceeded. Passenger rejected.' });
        }

        // We incremented attempts optimistically; now compare the provided OTP with stored hash
        const match = await bcrypt.compare(otp.toString(), updated.otpHash);
        if (match) {
            // Mark as verified
            await RideOtp.findByIdAndUpdate(updated._id, { isVerified: true });
            // Update ride and rider status
            const riderEntry = ride.riders.find(r => r.user.toString() === passengerId);
            if (riderEntry) riderEntry.status = 'in-ride';
            if (ride.status !== 'started') ride.status = 'started';
            ride.notifications.push({ message: `Passenger ${passengerId} verified and boarded. Ride started.`, toRiderIds: [passengerId] });
            await ride.save();
            return res.json({ message: 'OTP verified. Ride started for this passenger.' });
        }

        // Incorrect OTP — compute remaining attempts (updated.attempts already incremented)
        const remaining = Math.max(0, 3 - (updated.attempts || 0));
        if ((updated.attempts || 0) >= 3) {
            // Reject the passenger
            const riderEntry = ride.riders.find(r => r.user.toString() === passengerId);
            if (riderEntry) riderEntry.status = 'rejected';
            ride.notifications.push({ message: 'A passenger was rejected due to repeated invalid OTP attempts.', toRiderIds: [passengerId] });
            await ride.save();
            return res.status(403).json({ message: 'Maximum OTP attempts exceeded. Passenger rejected.' });
        }

        return res.status(400).json({ message: 'Invalid OTP.', attemptsLeft: remaining });
    } catch (err) {
        console.error('Verify OTP error:', err.message);
        return res.status(500).json({ message: 'Server error verifying OTP.' });
    }
});

// Provider: reject a request
app.post('/api/provider/requests/:rideId/:riderId/reject', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'provider') {
            return res.status(403).json({ message: 'Only providers can reject requests.' });
        }
        const { rideId, riderId } = req.params;
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found.' });
        if (ride.provider.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized for this ride.' });
        }
        const riderEntry = ride.riders.find(r => r.user.toString() === riderId && r.status === 'pending');
        if (!riderEntry) return res.status(404).json({ message: 'Pending request not found.' });
        riderEntry.status = 'rejected';
        await ride.save();
        res.json({ message: 'Request rejected', rideId, riderId });
    } catch (err) {
        console.error('Reject request error:', err.message);
        res.status(500).json({ message: 'Server error updating request.' });
    }
});

// Provider: notify accepted riders about additional bookings/cost sharing
app.post('/api/provider/notify/:rideId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'provider') {
            return res.status(403).json({ message: 'Only providers can notify riders.' });
        }
        const { rideId } = req.params;
        const { message, toAllAccepted } = req.body || {};
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ message: 'Message is required.' });
        }
        const ride = await Ride.findById(rideId).populate('riders.user', 'name mobileNumber');
        if (!ride) return res.status(404).json({ message: 'Ride not found.' });
        if (ride.provider.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized for this ride.' });
        }
        const recipients = ride.riders.filter(r => r.status === 'accepted').map(r => r.user._id);
        if (toAllAccepted && recipients.length > 0) {
            ride.notifications.push({ message, toRiderIds: recipients });
            await ride.save();
        } else {
            // If no accepted riders yet, store a general notification
            ride.notifications.push({ message, toRiderIds: [] });
            await ride.save();
        }
        res.json({ message: 'Notification sent', recipients: recipients.map(id => id.toString()) });
    } catch (err) {
        console.error('Notify riders error:', err.message);
        res.status(500).json({ message: 'Server error sending notification.' });
    }
});

// Rider: fetch notifications for rides they are part of (accepted only)
app.get('/api/rider/notifications', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'rider') {
            return res.status(403).json({ message: 'Only riders can view notifications.' });
        }
        const rides = await Ride.find({ 'riders.user': req.user.id, 'riders.status': 'accepted' });
        const items = rides.flatMap(ride => (ride.notifications || []).filter(n => !n.toRiderIds?.length || n.toRiderIds.some(id => id.toString() === req.user.id.toString())).map(n => ({
            rideId: ride.id,
            message: n.message,
            createdAt: n.createdAt,
        })));
        res.json({ notifications: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
    } catch (err) {
        console.error('Rider notifications error:', err.message);
        res.status(500).json({ message: 'Server error fetching notifications.' });
    }
});

// Rider: list own requests with statuses
app.get('/api/rider/requests', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'rider') {
            return res.status(403).json({ message: 'Only riders can view their requests.' });
        }
        const rides = await Ride.find({ 'riders.user': req.user.id })
            .populate('provider', 'name mobileNumber')
            .sort({ createdAt: -1 });
        const requests = [];
        rides.forEach(ride => {
            ride.riders.forEach(r => {
                if (r.user.toString() === req.user.id) {
                    requests.push({
                        rideId: ride.id,
                        startPoint: ride.startPoint,
                        destination: ride.destination,
                        startTime: ride.startTime,
                        provider: { id: ride.provider.id, name: ride.provider.name, mobileNumber: ride.provider.mobileNumber },
                        status: r.status,
                    });
                }
            });
        });
        res.json({ requests });
    } catch (err) {
        console.error('Rider requests error:', err.message);
        res.status(500).json({ message: 'Server error fetching rider requests.' });
    }
});

// Start the server only when this file is run directly. Export `app` for tests.
// Start the server only when run directly. This lets tests require the app without starting the listener.
if (require.main === module) {
    const HOST = '0.0.0.0';
    app.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
}

module.exports = app;

// --- OCR: Google Cloud Vision Text Extraction ---
// Requires service account JSON file placed at backend/google-cloud-vision-api.json
try {
    const { ImageAnnotatorClient } = require('@google-cloud/vision');
    const visionClient = new ImageAnnotatorClient({
        keyFilename: path.join(__dirname, 'google-cloud-vision-api.json')
    });

    // @route POST /api/ocr/extract
    // @desc  Extract text from a base64 image using Google Vision
    // @access Private (but not role-specific)
    app.post('/api/ocr/extract', auth, async (req, res) => {
        try {
            const { imageBase64 } = req.body || {};
            if (!imageBase64) {
                return res.status(400).json({ message: 'imageBase64 is required' });
            }
            const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const [result] = await visionClient.documentTextDetection({ image: { content: imageBuffer } });
            let text = null;
            if (result?.fullTextAnnotation?.text) {
                text = result.fullTextAnnotation.text;
            } else if (result?.textAnnotations?.[0]?.description) {
                text = result.textAnnotations[0].description;
            }
            return res.json({ text: text || '' });
        } catch (err) {
            console.error('OCR extract error:', err?.message || err);
            return res.status(500).json({ message: 'Failed to extract text' });
        }
    });
} catch (e) {
    console.warn('Google Vision not initialized (dependency missing?):', e?.message || e);
}

