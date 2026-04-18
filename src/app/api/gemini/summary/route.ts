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

    // Limit content length to prevent abuse
    const sanitizedContent = content.substring(0, 50000);

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'أنت مساعد تعليمي متخصص في تلخيص المحتوى الأكاديمي للطلاب العرب. تقوم بتلخيص المحتوى بأسلوب تعليمي مبسط ومorganized باستخدام نقاط واضحة وعناوين فرعية باللغة العربية.'
        },
        {
          role: 'user',
          content: `قم بتلخيص المحتوى التالي بأسلوب تعليمي مبسط لطلاب الجامعات. اجعل التلخيص منظماً باستخدام نقاط واضحة وعناوين فرعية. المحتوى:\n\n${sanitizedContent}`
        }
      ],
      thinking: { type: 'disabled' }
    });

    const summary = completion.choices[0]?.message?.content;
    
    if (!summary) {
      return NextResponse.json(
        { success: false, error: 'فشل في إنشاء الملخص' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('Summary generation error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء إنشاء الملخص' },
      { status: 500 }
    );
  }
}
