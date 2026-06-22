/**
 * FaceData model.
 */

const mongoose = require('mongoose');

// Section: Schema
const boundingBoxSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true }
}, {
  _id: false
});

const faceDataSchema = new mongoose.Schema({
  imageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  descriptor: {
    type: [Number],
    required: true,
    validate: {
      validator: function validateDescriptor(value) {
        return Array.isArray(value) && value.length === 128;
      },
      message: 'Face descriptors must contain 128 values.'
    }
  },
  boundingBox: {
    type: boundingBoxSchema,
    required: true
  }
}, {
  versionKey: false
});

faceDataSchema.index({ eventId: 1 });

module.exports = mongoose.model('FaceData', faceDataSchema);
