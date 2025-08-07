import InvoiceModel from '../models/Invoice.js';
import PaymentModel from '../models/Payment.js';
import StudentModel from '../models/Student.js';
import SchoolModel from '../models/School.js';
import FeeModel from '../models/Fee.js';
import TransactionLogModel from '../models/TransactionLog.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Placeholder for storage service (e.g., AWS S3)
const uploadToStorage = async (filePath, fileName) => {
  // Implement your storage logic here (e.g., AWS S3 upload)
  // For this example, assume local storage
  const storagePath = path.join('uploads/invoices', fileName);
  fs.renameSync(filePath, storagePath);
  return `/invoices/${fileName}`; // Return relative URL or S3 URL
};

// Generate PDF invoice
const generateInvoicePDF = async (invoiceData, school, student, fee, payment) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const fileName = `invoice-${invoiceData.invoiceNumber}.pdf`;
    const filePath = path.join('temp', fileName);
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // School Branding
    doc
      .fillColor(school.customFields.receiptBranding.primaryColor || '#000000')
      .fontSize(20)
      .text(school.name, { align: 'center' });
    if (school.customFields.receiptBranding.logoUrl) {
      doc.image(school.customFields.receiptBranding.logoUrl, 50, 50, { width: 100 });
    }
    doc.moveDown();

    // Invoice Header
    doc
      .fontSize(16)
      .fillColor('#000000')
      .text(`Invoice #${invoiceData.invoiceNumber}`, { align: 'left' })
      .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'left' })
      .moveDown();

    // Student Details
    doc
      .fontSize(12)
      .text('Bill To:', { underline: true })
      .text(`Name: ${student.name}`)
      .text(`Email: ${student.email}`)
      .text(`Student ID: ${student.studentId}`)
      .moveDown();

    // Fee Breakdown
    doc.text('Fee Breakdown:', { underline: true });
    invoiceData.feeBreakdown.forEach((item) => {
      doc.text(`${item.feeType}: $${item.amount.toFixed(2)}`);
      if (item.description) doc.text(`  ${item.description}`, { indent: 20 });
    });
    doc.moveDown();

    // Payment Info
    doc.text('Payment Information:', { underline: true });
    doc
      .text(`Payment Provider: ${invoiceData.paymentInfo.paymentProvider}`)
      .text(`Transaction Reference: ${invoiceData.paymentInfo.providerReference}`)
      .text(`Payment Date: ${new Date(invoiceData.paymentInfo.paymentDate).toLocaleDateString()}`)
      .moveDown();

    // Totals
    doc
      .text(`Subtotal: $${invoiceData.amount.toFixed(2)}`)
      .text(`Tax: $${invoiceData.tax.toFixed(2)}`)
      .text(`Total: $${invoiceData.totalAmount.toFixed(2)}`, { align: 'right' });

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', (err) => reject(err));
  });
};

// Create Invoice
export const createInvoice = async (req, res) => {
  try {
    const { paymentId } = req.body;

    // Validate payment
    const payment = await PaymentModel.findById(paymentId)
      .populate('studentId')
      .populate('schoolId')
      .populate('feeId');
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (payment.status !== 'confirmed') {
      return res.status(400).json({ message: 'Payment must be confirmed to generate invoice' });
    }

    const student = payment.studentId;
    const school = payment.schoolId;
    const fee = payment.feeId;

    // Prepare invoice data
    const invoiceData = {
      paymentId,
      studentId: student._id,
      schoolId: school._id,
      feeId: fee._id,
      amount: payment.amount,
      tax: 0, // Adjust based on your tax logic
      totalAmount: payment.amount, // Adjust if tax is applied
      status: 'paid',
      branding: school.customFields.receiptBranding,
      feeBreakdown: [
        {
          feeType: fee.feeType,
          amount: payment.amount,
          description: fee.description,
        },
      ],
      paymentInfo: {
        paymentProvider: payment.paymentProvider,
        providerReference: payment.providerMetadata.get('paystackRef') || 'N/A',
        paymentDate: payment.updatedAt,
      },
    };

    // Generate PDF
    const pdfPath = await generateInvoicePDF(invoiceData, school, student, fee, payment);
    const pdfUrl = await uploadToStorage(pdfPath, `invoice-${invoiceData.invoiceNumber}.pdf`);

    // Create invoice record
    const invoice = new InvoiceModel({ ...invoiceData, pdfUrl });
    await invoice.save();

    // Update payment with receipt URL
    payment.receiptUrl = pdfUrl;
    await payment.save();

    // Log to TransactionLog
    await TransactionLogModel.create({
      paymentId,
      schoolId: school._id,
      action: 'invoice_generated',
      metadata: {
        ip: req.ip,
        deviceInfo: req.headers['user-agent'],
        invoiceNumber: invoice.invoiceNumber,
      },
    });

    // Placeholder for AuditLog (to be implemented)
    // await AuditLogModel.create({
    //   entityType: 'Invoice',
    //   entityId: invoice._id,
    //   action: 'invoice_generated',
    //   actor: req.user?._id || 'system',
    //   timestamp: new Date(),
    //   metadata: { ip: req.ip, deviceInfo: req.headers['user-agent'] },
    // });

    res.status(201).json({ message: 'Invoice created successfully', invoice });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};