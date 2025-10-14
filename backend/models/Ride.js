// backend/models/Ride.js
// Mongoose schema for storing details of a ride.

const mongoose = require('mongoose');

const RideSchema = new mongoose.Schema({
    provider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    vehicleCategory: {
        type: String,
        enum: ['Car', 'Bike'],
        required: true
    },
    startPoint: {
        type: String,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    breakLocations: {
        type: [String], // Array of strings for multiple stops
        default: []
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date
    },
    rideCost: {
        type: Number,
        required: true
    },
    seats: {
        type: Number,
        default: 1,
        min: 1,
        max: 6
    },
    riders: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        otp: {
            type: String
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected', 'in-ride', 'completed', 'canceled'],
            default: 'pending'
        },
        speedReadings: [{ 
            timestamp: { type: Date, default: Date.now },
            speed: { type: Number }, // km/h
            latitude: { type: Number },
            longitude: { type: Number }
        }],
        averageSpeed: { type: Number, default: 0 }, // km/h
        rideStartTime: { type: Date },
        rideEndTime: { type: Date },
        reports: [{
            reportText: { type: String },
            reportedAt: { type: Date, default: Date.now }
        }],
        rating: { type: Number, min: 1, max: 5 },
        ratedAt: { type: Date }
    }],
    notifications: [{
        message: { type: String, required: true },
        fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        toRiderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        createdAt: { type: Date, default: Date.now },
        isDeleted: { type: Boolean, default: false },
        type: { type: String, default: null } // For special notification types like 'ride_end_request'
    }],
    status: {
        type: String,
        enum: ['created', 'started', 'completed', 'canceled'],
        default: 'created'
    },
    liveLocation: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    liveTrackingEnabled: {
        type: Boolean,
        default: false
    },
    womenOnly: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Ride', RideSchema);
