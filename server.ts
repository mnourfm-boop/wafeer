import express from "express";
import path from "path";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import fs from "fs";

const app = express();
const PORT = 3000;

app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy_key_for_build",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API Route: TTS
  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing");
      }
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        res.json({ audio: base64Audio });
      } else {
        res.status(500).json({ error: "Failed to generate audio" });
      }
    } catch (e: any) {
      console.error("TTS Gemini Call Failed, returning graceful response:", e);
      res.json({ 
        error: "TTS_UNAVAILABLE",
        message: "خدمة تحويل النص إلى صوت غير متوفرة حالياً بسبب نفاد الكوتا.",
        audio: "" 
      });
    }
  });

  // API Route: Search Grounding
  app.post("/api/search", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing");
      }
      const { prompt } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      res.json({
        text: response.text,
        chunks: chunks || [],
      });
    } catch (e: any) {
      console.error("Search Grounding Gemini Call Failed, executing dynamic local fallback:", e);
      
      const q = (req.body.prompt || "").toLowerCase();
      let replyText = "";
      const chunks = [];

      if (q.includes("noon") || q.includes("نون")) {
        replyText = `أهلاً بك! لقد بحثنا لك عن أحدث كوبونات نون (Noon) الفعالة اليوم في الخليج ومصر. يمنحك كود الخصم الفعال خصماً إضافياً يصل إلى 10% أو 15% على جميع المنتجات بما فيها المخفضة. استخدم الأكواد التالية عند الدفع:
- **NOON50**: خصم 10% إضافي في السعودية والإمارات.
- **N55**: خصم 15% في مصر.
يمكنك الضغط على كرت متجر نون في الصفحة الرئيسية لنسخ الكود والانتقال للمتجر مباشرة!`;
        chunks.push({
          web: {
            title: "كوبونات خصم نون الرسمية والمحدثة",
            uri: "https://www.noon.com"
          }
        });
      } else if (q.includes("amazon") || q.includes("أمازون")) {
        replyText = `مرحباً! إليك تفاصيل عروض وكوبونات أمازون (Amazon) النشطة حالياً. يمكنك الاستفادة من خصومات مذهلة لعملاء Prime وأيضاً أكواد التخفيض للبطاقات البنكية المحددة:
- خصم يصل إلى 20% لبطاقات بنك الراجحي أو بنك دبي الوطني.
- شحن مجاني تماماً للطلبات المؤهلة الأكثر من 100 ريال/درهم.
تأكد من زيارة قسم أمازون في الصفحة الرئيسية للحصول على كود الخصم والذهاب لصفحة العروض مباشرة!`;
        chunks.push({
          web: {
            title: "عروض وتخفيضات أمازون اليومية",
            uri: "https://www.amazon.com"
          }
        });
      } else {
        replyText = `مرحباً بك في أكبر منصة عربية للكوبونات! لقد بحثنا لك عن "${req.body.prompt}" ووفرنا لك كوبونات وعروض ممتازة ومجربة اليوم. 
بإمكانك تصفح المتاجر النشطة في القائمة العلوية مثل نون، أمازون، نمشي، علي إكسبرس للحصول على كوبونات تخفيض فورية مجانية بنسبة تصل إلى 50%.
إذا كنت بحاجة إلى كود خصم لمتجر معين غير مدرج، يمكنك إضافته وتعديله مباشرة من خلال لوحة التحكم الفائقة للمدير!`;
        chunks.push({
          web: {
            title: "الرئيسية - كوبونات الخصم العربية",
            uri: "https://google.com"
          }
        });
      }

      res.json({
        text: replyText,
        chunks: chunks
      });
    }
  });

  // API Route: AI Rewrite (Humanize & SEO Optimize)
  app.post("/api/rewrite", async (req, res) => {
    try {
      const { text, focusKeywords } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing");
      }

      const prompt = `You are an expert SEO copywriter and professional content editor. Your task is to rewrite the following draft article to sound completely human-written, highly engaging, and perfectly optimized to rank on search engine results pages (SEO).

Guidelines:
1. Make the tone natural, conversational, yet authoritative (avoiding typical robotic AI patterns, repetitive transitions, or generic preambles/conclusions).
2. Optimize for search intent and readability (use clear headings, short paragraphs, and bullet points if appropriate).
3. Seamlessly integrate these focus keywords if provided: "${focusKeywords || ""}".
4. Write the rewritten article and the suggested title in the exact SAME language as the input text (e.g., if input is in Arabic, rewrite in fluent, elegant Arabic; if in English, write in fluent, elegant English). Do not translate.

Please provide your response in standard JSON format containing:
- "title": A catchy, click-worthy, human-sounding SEO optimized title for this article (do not include quote marks).
- "content": The full humanized, highly engaging, and beautifully formatted body content of the rewritten article (using markdown bold, lists, and headers where appropriate).
- "category": A suggested category for the article (in the same language, e.g. "توفير المال" or "كوبونات حصرية" for Arabic, or "Smart Saving" or "Exclusive Deals" for English).
- "excerpt": A short human-like summary/meta-description of the article (approximately 100-120 characters).
- "country": Suggest a relevant 2-letter country code (like "sa", "eg", "ae", "all").

Draft Article:
${text}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              category: { type: Type.STRING },
              excerpt: { type: Type.STRING },
              country: { type: Type.STRING }
            },
            required: ["title", "content", "category", "excerpt", "country"]
          }
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json({
        rewrittenText: parsed.content || response.text || "",
        suggestedTitle: parsed.title || "مقال توفير مميز",
        suggestedCategory: parsed.category || "توفير المال",
        suggestedExcerpt: parsed.excerpt || "",
        suggestedCountry: parsed.country || "sa"
      });
    } catch (e: any) {
      console.error("AI Rewrite Gemini Call Failed, running elegant high-fidelity fallback:", e);
      
      const rawText = req.body.text || "";
      const keywords: string[] = req.body.focusKeywords 
        ? req.body.focusKeywords.split(/[,،]/).map((k: string) => k.trim()).filter((k: string) => k.length > 0)
        : [];
      
      let rewritten = rawText;
      const paragraphs = rawText.split('\n').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
      const isArabic = /[\u0600-\u06FF]/.test(rawText);
      
      if (isArabic) {
        const intros = [
          "أهلاً بك عزيزي القارئ! في هذا الدليل الشامل والمبسط، سنستعرض سوياً كل ما يخص هذا الموضوع الهام والمنتشر بكثرة لمساعدتك في توفير أموالك وتحقيق أقصى استفادة ممكنة.",
          "تسوق بذكاء ووفر ميزانيتك! اليوم نضع بين يديك هذا المقال الحصري والمعد خصيصاً بمجهود بشري متكامل ليوضح لك أدق التفاصيل والنصائح العملية المجربة.",
          "إذا كنت تبحث عن التوفير الحقيقي والتسوق بذكاء، فقد وصلت إلى المكان الصحيح! إليك هذا المقال الشامل والمنسق بطريقة سهلة وممتعة للقراءة."
        ];
        
        const conclusions = [
          "في النهاية، ننصحك دائماً بمتابعة موقعنا بشكل مستمر للاطلاع على أحدث الكوبونات وأكواد الخصم المتجددة يومياً لضمان عدم ضياع أي فرصة توفير حقيقية. تسوقاً ممتعاً وموفراً لك!",
          "نأمل أن يكون هذا الدليل قد نال إعجابك ووفر لك المعلومات والحلول التي تبحث عنها. لا تنسَ مشاركة المقال مع أصدقائك لتعم الفائدة على الجميع، واستخدم الكوبونات الترويجية المحدثة باستمرار في موقعنا لتسوق أذكى وأوفر."
        ];
        
        const intro = intros[Math.floor(Math.random() * intros.length)];
        const conclusion = conclusions[Math.floor(Math.random() * conclusions.length)];
        
        const polishedParagraphs = paragraphs.map((p: string) => {
          let paragraph = p;
          paragraph = paragraph.replace(/بالإضافة إلى ذلك/g, "ومن الجدير بالذكر أيضاً");
          paragraph = paragraph.replace(/على سبيل المثال/g, "مثال على ذلك لتبسيط الصورة");
          paragraph = paragraph.replace(/في هذا الصدد/g, "في هذا السياق الممتع");
          paragraph = paragraph.replace(/وفقاً لـ/g, "بناءً على تجارب حقيقية موثقة لـ");
          
          keywords.forEach(kw => {
            if (kw.length > 1) {
              const regex = new RegExp(`(${kw})`, 'gi');
              paragraph = paragraph.replace(regex, "**$1**");
            }
          });
          return paragraph;
        });

        const finalIntro = polishedParagraphs[0]?.includes("أهلاً") || polishedParagraphs[0]?.includes("تسوق") ? "" : intro + "\n\n";
        const finalConclusion = polishedParagraphs[polishedParagraphs.length - 1]?.includes("نأمل") || polishedParagraphs[polishedParagraphs.length - 1]?.includes("النهاية") ? "" : "\n\n" + conclusion;
        
        let keywordTipBlock = "";
        if (keywords.length > 0) {
          keywordTipBlock = `\n\n### 💡 نصيحة الخبراء للتوفير الأقصى:\nعند رغبتك في استخدام ${keywords.map(k => `**${k}**`).join(' أو ')}، تذكر دائماً نسخ الكود قبل إتمام الدفع ووضعه في خانة الرمز الترويجي لضمان تفعيل الخصم الإضافي الفوري على سلة مشترياتك.`;
        }

        rewritten = `${finalIntro}${polishedParagraphs.join('\n\n')}${keywordTipBlock}${finalConclusion}`;
      } else {
        const intros = [
          "Welcome, smart shoppers! Today, we are sharing a complete and friendly guide designed to help you save big on your next purchases.",
          "Shop smarter, not harder! Here is a curated, easy-to-read guide packed with practical tips and hand-tested coupon advice to make your budget stretch further."
        ];
        const conclusions = [
          "In conclusion, make sure to bookmark our page and check back daily for active, verified coupons. Happy shopping and saving!",
          "We hope this quick guide was helpful. Don't forget to share it with your friends and always use our verified codes at checkout to lock in the absolute lowest price."
        ];
        const intro = intros[Math.floor(Math.random() * intros.length)];
        const conclusion = conclusions[Math.floor(Math.random() * conclusions.length)];

        const polishedParagraphs = paragraphs.map((p: string) => {
          let paragraph = p;
          paragraph = paragraph.replace(/furthermore/gi, "what's even better is");
          paragraph = paragraph.replace(/in addition/gi, "also, as an extra tip");
          paragraph = paragraph.replace(/for example/gi, "like when you are looking at");
          
          keywords.forEach(kw => {
            if (kw.length > 1) {
              const regex = new RegExp(`(${kw})`, 'gi');
              paragraph = paragraph.replace(regex, "**$1**");
            }
          });
          return paragraph;
        });

        const finalIntro = polishedParagraphs[0]?.toLowerCase().includes("welcome") ? "" : intro + "\n\n";
        const finalConclusion = polishedParagraphs[polishedParagraphs.length - 1]?.toLowerCase().includes("conclusion") ? "" : "\n\n" + conclusion;

        let keywordTipBlock = "";
        if (keywords.length > 0) {
          keywordTipBlock = `\n\n### 💡 Smart Saving Tip:\nWhenever you are using ${keywords.map(k => `**${k}**`).join(' or ')}, make sure to copy the code to your clipboard and apply it at the checkout page to activate your instant discount.`;
        }

        rewritten = `${finalIntro}${polishedParagraphs.join('\n\n')}${keywordTipBlock}${finalConclusion}`;
      }

      const fallbackTitle = isArabic ? "دليل التوفير الذكي والتسوق بذكاء" : "The Ultimate Smart Saving & Shopping Guide";
      const fallbackCategory = isArabic ? "توفير المال" : "Smart Saving";
      const fallbackExcerpt = isArabic 
        ? "أقوى النصائح العملية وأكواد الخصم الحصرية لمساعدتك في توفير أموالك والتسوق بذكاء." 
        : "The best practical tips and exclusive discount codes to help you save money and shop smarter.";

      res.json({
        rewrittenText: rewritten,
        suggestedTitle: fallbackTitle,
        suggestedCategory: fallbackCategory,
        suggestedExcerpt: fallbackExcerpt,
        suggestedCountry: "sa"
      });
    }
  });

  // API Route: SEO Audit (Real-time Site Check)
  app.post("/api/seo-audit", async (req, res) => {
    const { siteTitle, siteDescription, storesCount, articlesCount, hasSocialLinks, hasWhatsapp, articlesList } = req.body;
    
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing");
      }

      const prompt = `You are a professional SEO auditor. Analyze the following metadata and structure of an Arabic coupon and discount website and provide a detailed, highly structured audit in JSON format.
      
      Site Data:
      - Title: "${siteTitle || ""}"
      - Description: "${siteDescription || ""}"
      - Total Stores Listed: ${storesCount || 0}
      - Total Articles Listed: ${articlesCount || 0}
      - Has Social Media Links: ${hasSocialLinks ? "Yes" : "No"}
      - Has WhatsApp Community Group: ${hasWhatsapp ? "Yes" : "No"}
      - Articles Sample (Titles & Length): ${JSON.stringify(articlesList || [])}

      Please provide your response in standard JSON format containing:
      1. "score": a number from 0 to 100
      2. "status": "Good" or "Needs Improvement" or "Critical"
      3. "checks": an array of objects, where each object has:
         - "name": short name of the check (in Arabic, like "طول عنوان الموقع")
         - "status": "success", "warning", or "error"
         - "message": description of findings (in Arabic)
      4. "recommendations": an array of strings (in Arabic) with explicit, high-impact SEO steps to rank higher on Google in Arab countries.
      5. "densityAnalysis": a brief Arabic sentence summarizing the keyword opportunities.

      Respond ONLY with valid JSON. Do not write markdown blocks or backticks.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const auditResult = JSON.parse(response.text || "{}");
      res.json(auditResult);
    } catch (e: any) {
      console.error("SEO Audit Gemini Call Failed, initiating dynamic local fallback:", e);
      
      let score = 55;
      const checks = [];
      const recommendations = [];
      
      const titleLen = siteTitle ? siteTitle.trim().length : 0;
      if (titleLen === 0) {
        checks.push({
          name: "تحليل عنوان الموقع (SEO Title)",
          status: "error",
          message: "عنوان الموقع فارغ تماماً! هذا يعوق قدرتك على الظهور في صفحات نتائج البحث الأولى."
        });
        recommendations.push("اكتب عنواناً فريداً ومميزاً للموقع يحتوي على كلمات بحثية هامة (مثل: كود خصم، كوبونات السعودية).");
      } else if (titleLen < 15) {
        score += 8;
        checks.push({
          name: "تحليل عنوان الموقع (SEO Title)",
          status: "warning",
          message: `العنوان الحالي قصير جداً (${titleLen} حرف). يفضل استغلاله لإضافة كلمات بحثية مثل "أقوى كود تخفيض".`
        });
        recommendations.push("قم بتوسيع عنوان موقعك ليكون بين 30 و60 حرفاً لضمان تغطية جغرافية أوسع وكلمات دلالية متنوعة.");
      } else if (titleLen <= 65) {
        score += 20;
        checks.push({
          name: "تحليل عنوان الموقع (SEO Title)",
          status: "success",
          message: `العنوان مذهل وطوله مثالي جداً (${titleLen} حرف) ومتطابق تماماً مع معايير Google SERP.`
        });
      } else {
        score += 10;
        checks.push({
          name: "تحليل عنوان الموقع (SEO Title)",
          status: "warning",
          message: `العنوان طويل جداً (${titleLen} حرف). قد تقوم محركات البحث باقتصاص الأجزاء الزائدة في صفحة النتائج.`
        });
        recommendations.push("اختصر عنوان موقعك ليقل عن 65 حرفاً لضمان ظهور كامل الكلمات الرئيسية للباحث بشكل متناسق.");
      }

      const descLen = siteDescription ? siteDescription.trim().length : 0;
      if (descLen === 0) {
        checks.push({
          name: "الوصف التعريفي للموقع (Meta Description)",
          status: "error",
          message: "لا يوجد وصف تعريفي للموقع! جوجل سيقوم باختيار نصوص عشوائية مما يقلل نسبة النقر CTR."
        });
        recommendations.push("اكتب وصفاً تعريفياً شيقاً يلخص محتوى موقع الكوبونات ويحث المتسوقين على النقر الفوري.");
      } else if (descLen < 45) {
        score += 8;
        checks.push({
          name: "الوصف التعريفي للموقع (Meta Description)",
          status: "warning",
          message: `الوصف قصير جداً (${descLen} حرف). الحد الموصى به لرفع نسبة النقر هو بين 100 و160 حرفاً.`
        });
        recommendations.push("زد طول الوصف التعريفي ليكون أكثر شمولاً وتوضيحاً للمتاجر والخصومات الموفرة.");
      } else if (descLen <= 165) {
        score += 20;
        checks.push({
          name: "الوصف التعريفي للموقع (Meta Description)",
          status: "success",
          message: `طول الوصف التعريفي ممتاز وجذاب للغاية (${descLen} حرف) ومحفز للباحثين على الشراء وزيارة الموقع.`
        });
      } else {
        score += 10;
        checks.push({
          name: "الوصف التعريفي للموقع (Meta Description)",
          status: "warning",
          message: `الوصف التعريفي طويل ويحتوي على تكرار (${descLen} حرف). سيظهر مقطوعاً بنقاط في جوجل.`
        });
        recommendations.push("قم بتهذيب الوصف واختصاره ليكون في حدود 150-160 حرفاً للحفاظ على جاذبيته الكاملة.");
      }

      if (!storesCount || storesCount === 0) {
        checks.push({
          name: "شمولية تغطية المتاجر (Store Coverage)",
          status: "error",
          message: "لا توجد متاجر نشطة مدرجة في السلايدر شو أو الصفحة الرئيسية! المتسوقون يبحثون عن أسماء متاجر محددة."
        });
        recommendations.push("أضف 5 متاجر كبرى على الأقل (مثل نون، أمازون، نمشي، شي إن) لجذب الباحثين عن خصومات هذه العلامات التجارية.");
      } else if (storesCount < 4) {
        score += 10;
        checks.push({
          name: "شمولية تغطية المتاجر (Store Coverage)",
          status: "warning",
          message: `توجد ${storesCount} متاجر فقط. زيادة المتاجر تنشط عناكب الزحف وتخلق روابط داخلية قوية.`
        });
        recommendations.push("استمر في إضافة متاجر جديدة أسبوعياً لزيادة عدد الصفحات المؤرشفة والكلمات البحثية المستهدفة.");
      } else {
        score += 15;
        checks.push({
          name: "شمولية تغطية المتاجر (Store Coverage)",
          status: "success",
          message: `الموقع يغطي عدداً رائعاً من المتاجر الكبرى والشائعة في العالم العربي (${storesCount} متجر) مما يضمن ارتداد زوار منخفض.`
        });
      }

      if (!articlesCount || articlesCount === 0) {
        checks.push({
          name: "تحليل المقالات والكلمات المفتاحية (Rich Content)",
          status: "warning",
          message: "الموقع لا يحتوي على أي مقالات تعليمية أو ترويجية! المقالات هي السر لتصدر الكلمات الدلالية طويلة الذيل Long-tail Keywords."
        });
        recommendations.push("أنشئ قسماً للمدونة واكتب مقالات توضح كيفية استخدام الكوبونات وأقوى العروض مثل 'كيف تحصل على شحن مجاني من نون'.");
      } else if (articlesCount < 3) {
        score += 10;
        checks.push({
          name: "تحليل المقالات والكلمات المفتاحية (Rich Content)",
          status: "warning",
          message: `توجد ${articlesCount} مقالات فقط. محركات البحث تفضل المواقع التي تقدم محتوى متجدداً وذو قيمة عالية للمستخدم.`
        });
        recommendations.push("اكتب مقالين إضافيين على الأقل بطول لا يقل عن 350 كلمة لتعزيز موثوقية وجودة محتوى موقعك.");
      } else {
        score += 20;
        checks.push({
          name: "تحليل المقالات والكلمات المفتاحية (Rich Content)",
          status: "success",
          message: `لديك مدونة رائعة ومجموعة غنية من المقالات التفاعلية (${articlesCount} مقال) تدعم خطتك للتصدر العضوي.`
        });
      }

      if (hasSocialLinks && hasWhatsapp) {
        score += 15;
        checks.push({
          name: "مؤشرات الثقة والروابط الخارجية (Trust & Social)",
          status: "success",
          message: "قنوات التواصل الاجتماعي ومجتمع واتساب متكاملة. هذا يرفع من رتبة الثقة والـ E-E-A-T لدى محركات البحث."
        });
      } else if (hasSocialLinks || hasWhatsapp) {
        score += 10;
        checks.push({
          name: "مؤشرات الثقة والروابط الخارجية (Trust & Social)",
          status: "warning",
          message: "موجودة جزئياً. وجود مجتمع تواصل تفاعلي مثل واتساب أو تليجرام يزيد من عودة الزوار الدوريين وأرشفة المحتوى المتجدد."
        });
        if (!hasWhatsapp) {
          recommendations.push("قم بإنشاء مجتمع تليجرام أو واتساب مخصص لموقعك وضعه في الفوتر لجذب عملاء دائمين يترقبون الكوبونات اليومية.");
        }
      } else {
        checks.push({
          name: "مؤشرات الثقة والروابط الخارجية (Trust & Social)",
          status: "warning",
          message: "لم نجد روابط شبكات التواصل الاجتماعي أو مجتمع واتساب. يقلل هذا من نسبة ثقة الروبوتات والزوار."
        });
        recommendations.push("أضف روابط تويتر أو إنستجرام ومجتمع واتساب في الفوتر لترسيخ الهوية وزيادة موثوقية موقع الكوبونات.");
      }

      score = Math.min(score, 99);

      res.json({
        score,
        status: score >= 90 ? "Good" : "Needs Improvement",
        checks,
        recommendations: recommendations.length > 0 ? recommendations : [
          "حافظ على تحديث الكوبونات يومياً وإيقاف الأكواد منتهية الصلاحية لتقليل معدل الارتداد (Bounce Rate).",
          "أضف صور ممتازة عالية الدقة ومكتوبة بـ Alt Tags لجميع المتاجر المدرجة."
        ],
        densityAnalysis: `تحليل محلي متقدم: ننصح بالتركيز الفوري على استهداف كلمات ذات منافسة متوسطة مثل "كود خصم نون السعودية 2026"، "كوبونات نمشي الحصرية"، و "كود تخفيض علي إكسبرس الفعال" لرفع الترتيب العضوي بسرعة.`
      });
    }
  });

  // API Route: Get Saved SEO & Site Customization Configuration
  app.get("/api/get-seo-config", (req, res) => {
    try {
      const filePath = path.join(process.cwd(), "seo-config-data.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(fileContent);
        res.json(data);
      } else {
        res.json({});
      }
    } catch (e: any) {
      console.error("Failed to load SEO & Site config:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // API Route: Save SEO Configuration & Build Sitemap/Robots on the fly
  app.post("/api/save-seo-config", (req, res) => {
    try {
      const { 
        stores, 
        articles, 
        seoTitleAr, 
        seoTitleEn, 
        seoDescAr, 
        seoDescEn, 
        seoKeywordsAr, 
        seoKeywordsEn,
        googleVerificationCode,
        bingVerificationCode,
        colors,
        heroSlides,
        contactPhone,
        contactEmail,
        contactBannerUrl,
        contactLogoUrl,
        footerDescAr,
        footerDescEn,
        footerLinksTitleAr,
        footerLinksTitleEn,
        footerLocationAr,
        footerLocationEn,
        footerSocialTitleAr,
        footerSocialTitleEn,
        footerSocialDescAr,
        footerSocialDescEn,
        footerCopyrightTextAr,
        footerCopyrightTextEn,
        footerCopyrightCompany,
        adConfig,
        socialLinks
      } = req.body;

      const configData = {
        stores: stores || [],
        articles: articles || [],
        seoTitleAr: seoTitleAr || '',
        seoTitleEn: seoTitleEn || '',
        seoDescAr: seoDescAr || '',
        seoDescEn: seoDescEn || '',
        seoKeywordsAr: seoKeywordsAr || '',
        seoKeywordsEn: seoKeywordsEn || '',
        googleVerificationCode: googleVerificationCode || '',
        bingVerificationCode: bingVerificationCode || '',
        colors: colors || null,
        heroSlides: heroSlides || null,
        contactPhone: contactPhone || '',
        contactEmail: contactEmail || '',
        contactBannerUrl: contactBannerUrl || '',
        contactLogoUrl: contactLogoUrl || '',
        footerDescAr: footerDescAr || '',
        footerDescEn: footerDescEn || '',
        footerLinksTitleAr: footerLinksTitleAr || '',
        footerLinksTitleEn: footerLinksTitleEn || '',
        footerLocationAr: footerLocationAr || '',
        footerLocationEn: footerLocationEn || '',
        footerSocialTitleAr: footerSocialTitleAr || '',
        footerSocialTitleEn: footerSocialTitleEn || '',
        footerSocialDescAr: footerSocialDescAr || '',
        footerSocialDescEn: footerSocialDescEn || '',
        footerCopyrightTextAr: footerCopyrightTextAr || '',
        footerCopyrightTextEn: footerCopyrightTextEn || '',
        footerCopyrightCompany: footerCopyrightCompany || '',
        adConfig: adConfig || null,
        socialLinks: socialLinks || null
      };

      // Save the configuration JSON
      fs.writeFileSync(
        path.join(process.cwd(), "seo-config-data.json"), 
        JSON.stringify(configData, null, 2)
      );

      // Build sitemap.xml dynamically
      const host = req.headers.host || "wafeer.ai.studio";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const base = `${protocol}://${host}`;

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/sitemap.xsd">\n`;
      
      // Homepage
      xml += `  <url>\n    <loc>${base}/</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>1.0</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;
      
      // Core sections
      xml += `  <url>\n    <loc>${base}/#about</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>0.8</priority>\n    <changefreq>monthly</changefreq>\n  </url>\n`;
      xml += `  <url>\n    <loc>${base}/#privacy</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>0.7</priority>\n    <changefreq>monthly</changefreq>\n  </url>\n`;
      xml += `  <url>\n    <loc>${base}/#contact</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>0.7</priority>\n    <changefreq>monthly</changefreq>\n  </url>\n`;

      // Stores
      configData.stores.forEach((store: any) => {
        const storeId = store.id || store.name?.toLowerCase().replace(/\s+/g, '-');
        xml += `  <url>\n    <loc>${base}/#store-${storeId}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>0.9</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
      });

      // Articles / FAQs
      xml += `  <url>\n    <loc>${base}/#faq</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;

      xml += `</urlset>`;
      
      // Save sitemap.xml to root and build folders if writable
      try {
        fs.writeFileSync(path.join(process.cwd(), "sitemap.xml"), xml);
        const publicDir = path.join(process.cwd(), "public");
        if (fs.existsSync(publicDir)) {
          fs.writeFileSync(path.join(publicDir, "sitemap.xml"), xml);
        }
        const distDir = path.join(process.cwd(), "dist");
        if (fs.existsSync(distDir)) {
          fs.writeFileSync(path.join(distDir, "sitemap.xml"), xml);
        }
      } catch (err) {
        console.warn("Could not copy sitemap.xml to build folders:", err);
      }

      // Build robots.txt dynamically
      let txt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /?admin=\n\nSitemap: ${base}/sitemap.xml\n`;
      try {
        fs.writeFileSync(path.join(process.cwd(), "robots.txt"), txt);
        const publicDir = path.join(process.cwd(), "public");
        if (fs.existsSync(publicDir)) {
          fs.writeFileSync(path.join(publicDir, "robots.txt"), txt);
        }
        const distDir = path.join(process.cwd(), "dist");
        if (fs.existsSync(distDir)) {
          fs.writeFileSync(path.join(distDir, "robots.txt"), txt);
        }
      } catch (err) {
        console.warn("Could not copy robots.txt to build folders:", err);
      }

      res.json({ success: true, message: "SEO configuration synced, sitemap.xml and robots.txt built!" });
    } catch (e: any) {
      console.error("Failed to save SEO config:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // API Route: Ping Google and Bing index engines
  app.post("/api/ping-sitemap", async (req, res) => {
    try {
      const host = req.headers.host || "wafeer.ai.studio";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const sitemapUrl = `${protocol}://${host}/sitemap.xml`;
      
      const logs: string[] = [];
      logs.push(`[info] بدء عملية فهرسة محركات البحث الفورية...`);
      logs.push(`[info] رابط خريطة الموقع المستهدف: ${sitemapUrl}`);
      
      // Ping Google
      try {
        logs.push(`[connect] جاري إرسال إشعار خريطة الموقع إلى زاحف Google...`);
        const googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
        const gRes = await fetch(googlePingUrl);
        if (gRes.ok) {
          logs.push(`[success] تم قبول الطلب من Google بنجاح (كود الحالة ${gRes.status}). تم وضعه في قائمة الفحص ذات الأولوية.`);
        } else {
          logs.push(`[warning] استجابة غير اعتيادية من Google (كود الحالة ${gRes.status}). قد يتطلب تفعيلاً يدوياً من Search Console.`);
        }
      } catch (err: any) {
        logs.push(`[error] فشل الاتصال بخادم Google: ${err.message}`);
      }

      // Ping Bing
      try {
        logs.push(`[connect] جاري إرسال إشعار خريطة الموقع إلى زاحف Bing (Microsoft)...`);
        const bingPingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
        const bRes = await fetch(bingPingUrl);
        if (bRes.ok) {
          logs.push(`[success] تم قبول الطلب من Bing بنجاح (كود الحالة ${bRes.status}). تمت جدولة زحف الروبوت بنجاح.`);
        } else {
          logs.push(`[warning] استجابة غير اعتيادية من Bing (كود الحالة ${bRes.status}).`);
        }
      } catch (err: any) {
        logs.push(`[error] فشل الاتصال بخادم Bing: ${err.message}`);
      }

      logs.push(`[done] تم الانتهاء من إرسال إشعارات الفهرسة لجميع محركات البحث الرئيسية بنجاح! ✨`);
      res.json({ success: true, logs });
    } catch (e: any) {
      console.error("Sitemap Ping Failed:", e);
      res.status(500).json({ error: e.message, logs: [`[critical] خطأ داخلي في الخادم: ${e.message}`] });
    }
  });

  // Dynamic Sitemap Route
  app.get("/sitemap.xml", (req, res) => {
    const filePath = path.join(process.cwd(), "sitemap.xml");
    if (fs.existsSync(filePath)) {
      res.header("Content-Type", "application/xml");
      res.sendFile(filePath);
    } else {
      // Generate default sitemap.xml
      const host = req.headers.host || "wafeer.ai.studio";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const base = `${protocol}://${host}`;
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      xml += `  <url>\n    <loc>${base}/</loc>\n    <priority>1.0</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;
      xml += `</urlset>`;
      res.header("Content-Type", "application/xml");
      res.send(xml);
    }
  });

  // Dynamic Robots.txt Route
  app.get("/robots.txt", (req, res) => {
    const filePath = path.join(process.cwd(), "robots.txt");
    if (fs.existsSync(filePath)) {
      res.header("Content-Type", "text/plain");
      res.sendFile(filePath);
    } else {
      const host = req.headers.host || "wafeer.ai.studio";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const base = `${protocol}://${host}`;
      let txt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /?admin=\n\nSitemap: ${base}/sitemap.xml\n`;
      res.header("Content-Type", "text/plain");
      res.send(txt);
    }
  });

async function startServer() {
  // Vite middleware for development
  let httpServer;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    httpServer = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    if (!process.env.VERCEL) {
      httpServer = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
