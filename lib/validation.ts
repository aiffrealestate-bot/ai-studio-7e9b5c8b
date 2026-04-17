import { z } from 'zod';

// ---------------------------------------------------------------------------
// Lead / Contact form schema
// Supports the Hebrew RTL contact form on the landing page
// ---------------------------------------------------------------------------
export const leadSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'שם מלא חייב להכיל לפחות 2 תווים')
    .max(120, 'שם מלא ארוך מדי'),

  phone: z
    .string()
    .trim()
    .regex(
      /^(\+972|0)(\-)?([23489]{1})(\-)?\d{7}$|^(\+972|0)[5][0-9](\-)?\d{7}$/,
      'מספר טלפון לא תקין — נא הזן מספר ישראלי'
    ),

  email: z
    .string()
    .trim()
    .email('כתובת אימייל לא תקינה')
    .max(254, 'כתובת אימייל ארוכה מדי')
    .optional()
    .or(z.literal('')),

  subject: z
    .string()
    .trim()
    .min(2, 'נושא הפנייה חייב להכיל לפחות 2 תווים')
    .max(200, 'נושא הפנייה ארוך מדי'),

  message: z
    .string()
    .trim()
    .min(10, 'הודעה חייבת להכיל לפחות 10 תווים')
    .max(3000, 'הודעה ארוכה מדי — עד 3000 תווים'),

  practice_area: z
    .enum([
      'נדלן',
      'דיני_עבודה',
      'דיני_משפחה',
      'חוזים',
      'ליטיגציה',
      'אחר',
    ])
    .optional(),

  preferred_contact: z
    .enum(['phone', 'email', 'whatsapp'])
    .default('phone'),

  consent: z
    .literal(true, {
      errorMap: () => ({ message: 'יש לאשר את תנאי הפרטיות כדי לשלוח את הטופס' }),
    }),
});

export type LeadInput = z.infer<typeof leadSchema>;

// ---------------------------------------------------------------------------
// Consultation booking schema (optional — used if a booking form is added)
// ---------------------------------------------------------------------------
export const consultationSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'שם מלא חייב להכיל לפחות 2 תווים')
    .max(120, 'שם מלא ארוך מדי'),

  phone: z
    .string()
    .trim()
    .regex(
      /^(\+972|0)(\-)?([23489]{1})(\-)?\d{7}$|^(\+972|0)[5][0-9](\-)?\d{7}$/,
      'מספר טלפון לא תקין'
    ),

  preferred_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין — נא בחר תאריך')
    .refine((d) => new Date(d) >= new Date(new Date().toDateString()), {
      message: 'לא ניתן לבחור תאריך בעבר',
    }),

  notes: z.string().trim().max(1000, 'הערות ארוכות מדי').optional(),

  consent: z.literal(true, {
    errorMap: () => ({ message: 'יש לאשר את תנאי הפרטיות' }),
  }),
});

export type ConsultationInput = z.infer<typeof consultationSchema>;
