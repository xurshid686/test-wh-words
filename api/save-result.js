const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const testData = req.body;
    
    // Validate required fields
    if (!testData || !testData.studentName) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing student name' 
      });
    }

    const totalQuestions = testData.questions?.length || 0;
    const correctAnswers = testData.questions?.filter(q => 
      q.selected !== undefined && q.selected === q.correct
    ).length || 0;
    const unansweredQuestions = testData.questions?.filter(q => 
      q.selected === undefined
    ).length || 0;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    // Calculate time information
    const minutesSpent = Math.floor((testData.timeSpent || 0) / 60);
    const secondsSpent = (testData.timeSpent || 0) % 60;
    const timeSpentFormatted = `${minutesSpent}m ${secondsSpent}s`;
    
    const minutesLeft = Math.floor((testData.timeLeft || 0) / 60);
    const secondsLeft = (testData.timeLeft || 0) % 60;
    const timeLeftFormatted = `${minutesLeft}m ${secondsLeft}s`;
    
    // Get Telegram credentials from environment
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    // Create detailed report for Telegram
    let report = `📝 NEW TEST SUBMISSION\n\n`;
    report += `👤 Student: ${testData.studentName}\n`;
    report += `⏱️ Time Spent: ${timeSpentFormatted}\n`;
    report += `⏰ Time Left: ${timeLeftFormatted}\n`;
    report += `📊 Score: ${correctAnswers}/${totalQuestions} (${score}%)\n`;
    report += `❓ Unanswered: ${unansweredQuestions}\n`;
    report += `🚪 Page Leaves: ${testData.leaveCount || 0}\n`;
    report += `📅 Test Date: ${new Date().toLocaleString()}\n\n`;
    
    report += `DETAILED RESULTS:\n`;
    report += `────────────────────\n`;
    
    if (testData.questions) {
      testData.questions.forEach((q, index) => {
        const isCorrect = q.selected !== undefined && q.selected === q.correct;
        const isUnanswered = q.selected === undefined;
        const selectedOption = q.selected !== undefined ? q.options[q.selected] : 'Not answered';
        const correctOption = q.options[q.correct];
        
        let emoji = '❌';
        if (isCorrect) emoji = '✅';
        if (isUnanswered) emoji = '⏭️';
        
        report += `\n${emoji} Q${index + 1}: ${q.question}\n`;
        report += `   Student's answer: ${selectedOption}\n`;
        if (!isCorrect) {
          report += `   Correct answer: ${correctOption}\n`;
        }
      });
    }

    // Send to Telegram if configured
    let telegramSent = false;
    
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        await sendTelegramMessage(report, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
        telegramSent = true;
        console.log('✅ Telegram message sent successfully');
      } catch (error) {
        console.error('❌ Telegram error:', error.message);
      }
    } else {
      console.log('ℹ️ Telegram not configured');
    }

    // Log to console
    console.log('📊 Test submission received from:', testData.studentName);
    console.log('📈 Score:', `${correctAnswers}/${totalQuestions} (${score}%)`);

    // Send success response
    res.status(200).json({ 
      success: true, 
      message: 'Test submitted successfully',
      studentName: testData.studentName,
      score: `${correctAnswers}/${totalQuestions}`,
      percentage: score,
      telegramSent: telegramSent
    });

  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    });
  }
};

async function sendTelegramMessage(message, botToken, chatId) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  // Telegram has a 4096 character limit, so split if needed
  if (message.length > 4000) {
    message = message.substring(0, 4000) + '\n... (message truncated)';
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
    throw new Error(result.description || 'Telegram API error');
  }
  
  return result;
}
