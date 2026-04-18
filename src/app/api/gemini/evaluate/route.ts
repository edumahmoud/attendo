import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { question, correctAnswer, studentAnswer } = await request.json();
    
    if (!question || !correctAnswer || !studentAnswer) {
      return NextResponse.json(
        { success: false, error: 'جميع الحقول مطلوبة' },
        { status: 400 }
      );
    }

    // First check for exact match
    if (studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {
      return NextResponse.json({ success: true, data: { isCorrect: true } });
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'أنت مصحح اختبارات ذكي. تقرر ما إذا كانت إجابة الطالب صحيحة من الناحية المعنوية مقارنة بالإجابة النموذجية لسؤال "أكمل". لا تشدد على التطابق الحرفي، ركز على المعنى. ترد بكلمة واحدة فقط: "true" إذا كانت صحيحة، أو "false" إذا كانت خاطئة.'
        },
        {
          role: 'user',
          content: `السؤال: ${question}\nالإجابة النموذجية: ${correctAnswer}\nإجابة الطالب: ${studentAnswer}\n\nهل إجابة الطالب صحيحة معنوياً؟ رد بـ true أو false فقط.`
        }
      ],
      thinking: { type: 'disabled' }
    });

    const response = completion.choices[0]?.message?.content?.trim().toLowerCase() || '';
    const isCorrect = response.includes('true');

    return NextResponse.json({ success: true, data: { isCorrect } });
  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء تقييم الإجابة' },
      { status: 500 }
    );
  }
}
