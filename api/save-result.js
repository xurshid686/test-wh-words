const fetch = require('node-fetch');

// Get environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_LEAVES = 3;

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const testData = req.body;
    
    // Validate required fields
    if (!testData.studentName || !testData.questions) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: studentName and questions are required' 
      });
    }

    const totalQuestions = testData.questions.length;
    const correctAnswers = testData.questions.filter(q => 
      q.selected !== undefined && q.selected === q.correct
    ).length;
    const unansweredQuestions = testData.questions.filter(q => 
      q.selected === undefined
    ).length;
    const wrongAnswers = totalQuestions - correctAnswers - unansweredQuestions;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    // Calculate time information
    const minutesSpent = Math.floor(testData.timeSpent / 60);
    const secondsSpent = testData.timeSpent % 60;
    const timeSpentFormatted = `${minutesSpent}m ${secondsSpent}s`;
    
    const minutesLeft = Math.floor(testData.timeLeft / 60);
    const secondsLeft = testData.timeLeft % 60;
    const timeLeftFormatted = `${minutesLeft}m ${secondsLeft}s`;
    
    // Determine submission method
    let submissionMethod = 'Manual Submission';
    if (testData.timeLeft <= 0) {
      submissionMethod = "Time's Up (Auto-submitted)";
    } else if (testData.leaveCount > MAX_LEAVES) {
      submissionMethod = 'Too Many Page Leaves (Auto-submitted)';
    }

    // Create detailed report for Telegram
    let report = `📝 *NEW TEST SUBMISSION*\n\n`;
    report += `👤 *Student:* ${testData.studentName}\n`;
    report += `⏱️ *Time Spent:* ${timeSpentFormatted}\n`;
    report += `⏰ *Time Left:* ${timeLeftFormatted}\n`;
    report += `📊 *Score:* ${correctAnswers}/${totalQuestions} (${score}%)\n`;
    report += `❓ *Unanswered:* ${unansweredQuestions}\n`;
    report += `🚪 *Page Leaves:* ${testData.leaveCount}\n`;
    report += `📅 *Test Date:* ${new Date(testData.startTime).toLocaleString()}\n`;
    report += `🎯 *Submission:* ${submissionMethod}\n\n`;
    
    report += `*DETAILED RESULTS:*\n`;
    report += `────────────────────\n`;
    
    testData.questions.forEach((q, index) => {
      const isCorrect = q.selected !== undefined && q.selected === q.correct;
      const isUnanswered = q.selected === undefined;
      const selectedOption = q.selected !== undefined ? q.options[q.selected] : '❌ Not answered';
      const correctOption = q.options[q.correct];
      
      let emoji = '❌'; // Wrong
      if (isCorrect) emoji = '✅';
      if (isUnanswered) emoji = '⏭️';
      
      report += `\n${emoji} *Q${index + 1}:* ${q.question}\n`;
      report += `   Student's answer: ${selectedOption}\n`;
      if (!isCorrect && !isUnanswered) {
        report += `   Correct answer: ${correctOption}\n`;
      }
      if (isUnanswered) {
        report += `   Correct answer: ${correctOption}\n`;
      }
    });

    // Summary statistics
    report += `\n────────────────────\n`;
    report += `*SUMMARY*\n`;
    report += `✅ Correct: ${correctAnswers}\n`;
    report += `❌ Wrong: ${wrongAnswers}\n`;
    report += `⏭️ Unanswered: ${unansweredQuestions}\n`;
    report += `🏆 Final Score: ${score}%\n`;

    // Send to Telegram if configured
    let telegramSent = false;
    let telegramError = null;
    
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        await sendTelegramMessage(report);
        telegramSent = true;
      } catch (error) {
        telegramError = error.message;
        console.error('Failed to send Telegram message:', error);
      }
    } else {
      console.log('Telegram not configured: Missing BOT_TOKEN or CHAT_ID');
    }

    // Log to console (Vercel logs)
    console.log('📊 TEST SUBMISSION RECEIVED');
    console.log('Student:', testData.studentName);
    console.log('Score:', `${correctAnswers}/${totalQuestions} (${score}%)`);
    console.log('Time Spent:', timeSpentFormatted);
    console.log('Time Left:', timeLeftFormatted);
    console.log('Page Leaves:', testData.leaveCount);
    console.log('Submission Method:', submissionMethod);
    console.log('Unanswered:', unansweredQuestions);
    console.log('Telegram Sent:', telegramSent);
    if (telegramError) {
      console.log('Telegram Error:', telegramError);
    }

    // Send success response
    res.status(200).json({ 
      success: true, 
      message: 'Test submitted successfully',
      studentName: testData.studentName,
      score: `${correctAnswers}/${totalQuestions}`,
      percentage: score,
      telegramSent: telegramSent,
      telegramError: telegramError
    });

  } catch (error) {
    console.error('❌ Error processing test submission:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    });
  }
};

async function sendTelegramMessage(message) {
  // Split long messages (Telegram has a 4096 character limit)
  const maxLength = 4000;
  if (message.length > maxLength) {
    const parts = [];
    for (let i = 0; i < message.length; i += maxLength) {
      parts.push(message.substring(i, i + maxLength));
    }
    
    // Send first part
    await sendSingleMessage(parts[0]);
    
    // Send remaining parts after a short delay
    for (let i = 1; i < parts.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await sendSingleMessage(parts[i]);
    }
  } else {
    await sendSingleMessage(message);
  }
}

async function sendSingleMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });

  const result = await response.json();
  
  if (!result.ok) {
    throw new Error(`Telegram API error: ${result.description}`);
  }
  
  return result;
}
