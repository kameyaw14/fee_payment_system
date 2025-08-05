import mongoose from "mongoose";
import bcrypt from 'bcryptjs';

const studentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    studentId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    yearOfStudy: { type: String, required: true },
    registrationInfo: { type: Map, of: String, default: {} },
    courses: [{ type: String }],
  },
  { timestamps: true }
);

studentSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

studentSchema.index({ schoolId: 1, studentId: 1 });
studentSchema.index({ email: 1 });

const StudentModel =
  mongoose.models.Student || mongoose.model("Student", studentSchema);

export default StudentModel;