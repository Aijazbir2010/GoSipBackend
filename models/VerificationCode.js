import mongoose from "mongoose";

const VerificationCodeSchema = new mongoose.Schema({
    code: {type: String, required: true},
    email: {type: String, required: true},
    expiresAt: {type: Date, required: true},
})

VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const VerificationCode = mongoose.models.VerificationCode || mongoose.model('VerificationCode', VerificationCodeSchema)
export default VerificationCode