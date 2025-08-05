import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const schoolSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
  contactDetails: {
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  customFields: {
    feeStructure: { type: Map, of: String, default: {} }, // e.g., { "tuition": "10000", "hostel": "5000" }
    receiptBranding: {
      logoUrl: { type: String }, // Cloudinary URL for logo
      primaryColor: { type: String, default: '#000000' },
    },
  },
  paymentProviders: [{
    provider: { type: String, enum: ['Paystack', 'Flutterwave', 'Payswitch'], default: 'Paystack' },
    apiKey: { type: String, required: true },
    priority: { type: Number, default: 1 }, // For dynamic switching
  }],
},{ timestamps: true });  

schoolSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Indexes
schoolSchema.index({ email: 1 });

const SchoolModel = mongoose.models.School || mongoose.model('School', schoolSchema);

export default SchoolModel;