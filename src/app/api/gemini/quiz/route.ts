import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json();
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'المحتوى مطلوب' },
        { status: 400 }
      );
    }

    const sanitizedContent = content.substring(0, 50000);

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `أنت مساعد تعليمي متخصص في إنشاء اختبارات تعليمية. تقوم بإنشاء اختبارات شاملة باللغة العربية بتنسيق JSON فقط.

يجب أن يكون الرد بتنسيق JSON فقط ويحتوي على مصفوفة من الكائنات تحت اسم "questions":
- للـ mcq: { "type": "mcq", "question": "...", "options": ["خيار1", "خيار2", "خيار3", "خيار4"], "correctAnswer": "الخيار الصحيح" }
- للـ boolean: { "type": "boolean", "question": "...", "options": ["صح", "خطأ"], "correctAnswer": "صح أو خطأ" }
- للـ completion: { "type": "completion", "question": "سؤال يحتوي على ____", "correctAnswer": "الإجابة النموذجية" }
- للـ matching: { "type": "matching", "question": "عنوان السؤال", "pairs": [{"key": "المصطلح", "value": "التعريف"}] }

أنشئ 6 أسئلة متنوعة تغطي الأنواع الأربعة. تأكد أن الرد JSON صالح فقط بدون أي نص إضافي.`
        },
        {
          role: 'user',
          content: `بناءً على المحتوى التالي، قم بإنشاء اختبار شامل مكون من 6 أسئلة متنوعة:\n\n${sanitizedContent}`
        }
      ],
      thinking: { type: 'disabled' }
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      return NextResponse.json(
        { success: false, error: 'فشل في إنشاء الاختبار' },
        { status: 500 }
      );
    }

    // Parse JSON from response
    let questions;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        questions = parsed.questions || parsed;
      } else {
        questions = JSON.parse(responseText);
      }
    } catch {
      // If parsing fails, return the raw text for debugging
      return NextResponse.json(
        { success: false, error: 'فشل في تحليل استجابة الذكاء الاصطناعي', raw: responseText },
        { status: 500 }
      );
    }

    if (!Array.isArray(questions)) {
      return NextResponse.json(
        { success: false, error: 'تنسيق الأسئلة غير صحيح' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { questions } });
  } catch (error) {
    console.error('Quiz generation error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء إنشاء الاختبار' },
      { status: 500 }
    );
  }
}
