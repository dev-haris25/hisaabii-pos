/**
 * Localized in-app notification copy for Hisabi POS.
 * Messages use `{var}` placeholders.
 */

/** @param {string | null | undefined} locale */
export function normalizeNotificationLocale(locale) {
  return locale === 'ar' ? 'ar' : 'en'
}

/** @type {Record<string, { en: { title: string, message: string }, ar: { title: string, message: string } }>} */
const COPY = {
  zatca_report_failed: {
    en: {
      title: 'ZATCA report failed',
      message:
        'Invoice {invoiceNumber} could not be reported. We’ll retry automatically. Check the invoice for details.',
    },
    ar: {
      title: 'فشل الإبلاغ إلى ZATCA',
      message:
        'تعذر الإبلاغ عن الفاتورة {invoiceNumber}. سنعيد المحاولة تلقائياً. راجع الفاتورة للتفاصيل.',
    },
  },
  zatca_report_success: {
    en: {
      title: 'Invoice reported to ZATCA',
      message: 'Invoice {invoiceNumber} was reported successfully.',
    },
    ar: {
      title: 'تم الإبلاغ عن الفاتورة إلى ZATCA',
      message: 'تم الإبلاغ عن الفاتورة {invoiceNumber} بنجاح.',
    },
  },
  zatca_report_still_failed: {
    en: {
      title: 'ZATCA report still failing',
      message:
        'Invoice {invoiceNumber} failed again after retry. Please review it and fix the issue.',
    },
    ar: {
      title: 'ما زال الإبلاغ إلى ZATCA فاشلاً',
      message:
        'فشلت الفاتورة {invoiceNumber} مرة أخرى بعد إعادة المحاولة. يرجى مراجعتها ومعالجة المشكلة.',
    },
  },
  zatca_report_pending: {
    en: {
      title: 'ZATCA deadline approaching',
      message:
        '{detail} — about 1 hour left to report within the 24-hour B2C window.',
    },
    ar: {
      title: 'اقتراب مهلة إبلاغ الزكاة',
      message:
        '{detail} — تبقت نحو ساعة واحدةلبلاغ ضمن مهلة الـ 24 ساعة للفواتير المبسطة.',
    },
  },
  visa_expiring: {
    en: {
      title: 'Visa expiring soon',
      message: '{name} — visa expires on {expiryDate}.',
    },
    ar: {
      title: 'تأشيرة تنتهي قريبًا',
      message: '{name} — تنتهي التأشيرة في {expiryDate}.',
    },
  },
  visa_expired: {
    en: {
      title: 'Visa expired',
      message: '{name} — visa expired on {expiryDate}.',
    },
    ar: {
      title: 'تأشيرة منتهية',
      message: '{name} — انتهت التأشيرة في {expiryDate}.',
    },
  },
  salary_slip_generated: {
    en: {
      title: 'Salary slip created',
      message: '{detail}',
    },
    ar: {
      title: 'تم إنشاء مسير راتب',
      message: '{detail}',
    },
  },
  advance_paid: {
    en: {
      title: 'Advance payment recorded',
      message: '{detail}',
    },
    ar: {
      title: 'تم تسجيل سلفة',
      message: '{detail}',
    },
  },
  advance_outstanding: {
    en: {
      title: 'Outstanding advances',
      message: '{detail}',
    },
    ar: {
      title: 'سلف مستحقة',
      message: '{detail}',
    },
  },
  salary_cap_exceeded: {
    en: {
      title: 'Salary cap exceeded',
      message:
        'Payments to {name} for {payPeriod} exceeded the monthly salary cap ({cap}). The excess was recorded separately.',
    },
    ar: {
      title: 'تجاوز سقف الراتب',
      message:
        'تجاوزت المدفوعات لـ {name} عن فترة {payPeriod} سقف الراتب الشهري ({cap}). تم تسجيل الزيادة بشكل منفصل.',
    },
  },
  salary_cap_reached: {
    en: {
      title: 'Salary cap reached',
      message: 'Payments to {name} for {payPeriod} reached the monthly salary cap ({cap}).',
    },
    ar: {
      title: 'تم بلوغ سقف الراتب',
      message: 'بلغت المدفوعات لـ {name} عن فترة {payPeriod} سقف الراتب الشهري ({cap}).',
    },
  },
  invoice_voided: {
    en: {
      title: 'Invoice voided',
      message: '{detail}',
    },
    ar: {
      title: 'تم إلغاء فاتورة',
      message: '{detail}',
    },
  },
  credit_note_created: {
    en: {
      title: 'Credit note created',
      message: '{detail}',
    },
    ar: {
      title: 'تم إنشاء إشعار دائن',
      message: '{detail}',
    },
  },
  debit_note_created: {
    en: {
      title: 'Debit note created',
      message: '{detail}',
    },
    ar: {
      title: 'تم إنشاء إشعار مدين',
      message: '{detail}',
    },
  },
  role_changed: {
    en: {
      title: 'Roles updated',
      message: '{detail}',
    },
    ar: {
      title: 'تم تحديث الأدوار',
      message: '{detail}',
    },
  },
  member_joined: {
    en: {
      title: 'New team member',
      message: '{detail}',
    },
    ar: {
      title: 'انضم عضو جديد',
      message: '{detail}',
    },
  },
  stock_low: {
    en: {
      title: 'Low stock',
      message: '{name} is at {qty} (threshold {threshold}).',
    },
    ar: {
      title: 'مخزون منخفض',
      message: '{name} عند {qty} (الحد {threshold}).',
    },
  },
  kitchen_waste_high: {
    en: {
      title: 'High kitchen wastage',
      message: '{name} needs attention — waste {waste}.',
    },
    ar: {
      title: 'هدر مطبخ مرتفع',
      message: '{name} يحتاج انتباهاً — الهدر {waste}.',
    },
  },
  day_end_waste_high: {
    en: {
      title: 'High day-end wastage',
      message: 'The day-end report for {date} includes high wastage ({items}).',
    },
    ar: {
      title: 'هدر مرتفع في تقرير نهاية اليوم',
      message: 'تقرير نهاية اليوم {date} يتضمن هدراً مرتفعاً ({items}).',
    },
  },
  e_waiter_round_cancelled: {
    en: {
      title: 'Guest cancelled a round',
      message:
        'Order #{orderNumber} · Table {tableName} · Round {roundNumber} was cancelled by the guest.',
    },
    ar: {
      title: 'ألغى الضيف جولة',
      message:
        'الطلب رقم {orderNumber} · طاولة {tableName} · الجولة {roundNumber} ألغاه الضيف.',
    },
  },
}

/** @param {string} template @param {Record<string, string>} vars */
function interpolate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  )
}

/**
 * @param {string} type
 * @param {string | null | undefined} locale
 * @param {Record<string, string>} [vars]
 * @param {{ title?: string, message?: string }} [fallback]
 */
export function buildNotificationCopy(type, locale, vars = {}, fallback = {}) {
  const loc = normalizeNotificationLocale(locale)
  const entry = COPY[type]?.[loc] ?? COPY[type]?.en
  if (!entry) {
    return {
      title: fallback.title ?? type,
      message: fallback.message ?? vars.detail ?? '',
    }
  }
  return {
    title: interpolate(entry.title, vars),
    message: interpolate(entry.message, vars),
  }
}
