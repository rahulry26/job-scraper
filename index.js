import express from "express";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import fs from "fs";
import axios from "axios";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const URL =
  "https://www.linkedin.com/jobs/search/?keywords=Frontend%20Developer&location=India&f_TPR=r86400&sortBy=DD";
const TELEGRAM_BOT_TOKEN = "8046049755:AAHBcHtFRQ3q_0x0DvmgNVZ6r0FHhNqpqEA";
const TELEGRAM_CHAT_ID = "6410640034";
const JOBS_FILE = "jobs.json";

// ✅ Telegram Message Sender
const sendTelegramMessage = async (message) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });
    console.log("✅ Notification sent!");
  } catch (error) {
    console.error("❌ Error sending message:", error.message);
  }
};

// ✅ Scrape Jobs from LinkedIn
const scrapeJobs = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2" });

  const jobs = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".base-search-card__title"))
      .map((el) => ({
        title: el.innerText.trim(),
        link: el.closest("a")?.href || null,
      }))
      .filter((job) => job.link)
  );

  await browser.close();
  return jobs;
};

// ✅ Helper Function to Check Quiet Hours (10:30 PM to 7:00 AM)
const isQuietHours = () => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  const totalMinutes = hours * 60 + minutes;
  const startQuietMinutes = 22 * 60 + 30; // 10:30 PM
  const endQuietMinutes = 7 * 60; // 7:00 AM

  return totalMinutes >= startQuietMinutes || totalMinutes < endQuietMinutes;
};

// ✅ API Endpoint to Trigger Scraping and Get New Jobs
app.get("/api/scrape-jobs", async (req, res) => {
  console.log("🚀 Starting job scrape...");

  // Check for quiet hours
  if (isQuietHours()) {
    console.log(
      "⏰ Within quiet hours (10:30 PM - 7:00 AM). Skipping scraping."
    );
    return res.json({
      status: "skipped",
      message: "Within quiet hours. No scraping performed.",
    });
  }

  let prevJobs = [];

  if (fs.existsSync(JOBS_FILE)) {
    prevJobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
  }

  try {
    const currentJobs = await scrapeJobs();
    const newJobs = currentJobs.filter(
      (job) => !prevJobs.some((j) => j.link === job.link)
    );

    if (newJobs.length) {
      console.log(
        `🎉 Found ${newJobs.length} new jobs! Sending notifications...`
      );
      for (const job of newJobs) {
        const message = `🆕 *New Job Alert!*\n*${job.title}*\n[View Job](${job.link})`;
        await sendTelegramMessage(message);
      }
    } else {
      console.log("ℹ️ No new jobs found.");
    }

    fs.writeFileSync(JOBS_FILE, JSON.stringify(currentJobs, null, 2));

    res.json({
      status: "success",
      newJobs,
      totalFound: newJobs.length,
    });
  } catch (error) {
    console.error("❌ Error scraping jobs:", error.message);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// ✅ Home route
app.get("/", (req, res) => {
  res.send("🚀 LinkedIn Job Scraper API is running!");
});

// ✅ Start server
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
