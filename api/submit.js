const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    // Parse JSON body
    let testData;
    try {
      testData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON data'
      });
    }

    // Validate required fields
    if (!testData.studentName || !testData.questions) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: studentName and questions are required'
      });
    }

    // Calculate results
    const totalQuestions = testData.questions.length;
    const correctAnswers = testData.questions.filter(q => 
      q.selected !== undefined && q.selected === q.correct
    ).length;
    const unansweredQuestions = testData.questions.filter(q => 
      q.selected === undefined
    ).length;
    const wrongAnswers = totalQuestions - correctAnswers - unansweredQuestions;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    // Format time
    const minutesSpent = Math.floor((testData.timeSpent || 0) / 60);
    const secondsSpent = (testData.timeSpent || 0) % 60;
    const timeSpentFormatted = `${minutesSpent}m ${secondsSpent}s`;

    // Determine submission reason
    let submissionReason = 'Manual submission';
    if (testData.timeLeft <= 0) {
      submissionReason = 'Time expired';
    } else if (testData.leaveCount > 3) {
      submissionReason = 'Too many page leaves';
    }

    // Create report
    let report = `📝 ENGLISH TEST SUBMISSION\n\n`;
    report += `👤 Student: ${testData.studentName}\n`;
    report += `⏱️ Time spent: ${timeSpentFormatted}\n`;
    report += `⏰ Time left: ${Math.floor((testData.timeLeft || 0) / 60)}m ${(testData.timeLeft || 0) % 60}s\n`;
    report += `📊 Score: ${correctAnswers}/${totalQuestions} (${score}%)\n`;
    report += `✅ Correct: ${correctAnswers}\n`;
    report += `❌ Wrong: ${wrongAnswers}\n`;
    report += `⏭️ Unanswered: ${unansweredQuestions}\n`;
    report += `🚪 Page leaves: ${testData.leaveCount || 0}\n`;
    report += `🎯 Reason: ${submissionReason}\n`;
    report += `📅 Submitted: ${new Date().toLocaleString()}\n\n`;

    report += `DETAILED RESULTS:\n`;
    report += `────────────────────\n\n`;

    testData.questions.forEach((q, index) => {
      const isCorrect = q.selected !== undefined && q.selected === q.correct;
      const isUnanswered = q.selected === undefined;
      const selectedOption = q.selected !== undefined ? q.options[q.selected] : 'Not answered';
      const correctOption = q.options[q.correct];
      
      let emoji = '❌';
      if (isCorrect) emoji = '✅';
      if (isUnanswered) emoji = '⏭️';
      
      report += `${emoji} Question ${index + 1}: ${q.question}\n`;
      report += `   Student's answer: ${selectedOption}\n`;
      if (!isCorrect && !isUnanswered) {
        report += `   Correct answer: ${correctOption}\n`;
      }
      if (isUnanswered) {
        report += `   Correct answer: ${correctOption}\n`;
      }
      report += `\n`;
    });

    // Send to Telegram if configured
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        await sendToTelegram(report, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
        telegramSent = true;
        console.log('✅ Telegram notification sent');
      } catch (telegramError) {
        console.error('❌ Telegram error:', telegramError.message);
      }
    } else {
      console.log('ℹ️ Telegram not configured');
    }

    // Log to console
    console.log('🎯 Test submitted by:', testData.studentName);
    console.log('📈 Score:', `${correctAnswers}/${totalQuestions} (${score}%)`);
    console.log('⏱️ Time spent:', timeSpentFormatted);
    console.log('📤 Telegram sent:', telegramSent);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Test submitted successfully',
      data: {
        studentName: testData.studentName,
        score: `${correctAnswers}/${totalQuestions}`,
        percentage: score,
        telegramSent: telegramSent
      }
    });

  } catch (error) {
    console.error('💥 Server error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

async function sendToTelegram(message, botToken, chatId) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  // Split long messages
  if (message.length > 4000) {
    message = message.substring(0, 4000) + '\n\n... (message truncated)';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });

  const result = await response.json();
  
  if (!result.ok) {
    throw new Error(result.description || 'Unknown Telegram error');
  }
  
  return result;
}
