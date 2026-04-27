# Sprint Dashboard

A single-page analytics tool designed to transform Jira "CSV" exports into actionable sprint insights. This dashboard focuses on real-time Sprint health, bottleneck identification, and required velocity tracking.

## Features

- **Dynamic Metrics:** Instant calculation of Sprint Scope, Completion % and Days Remaining.
- **Smart Velocity Tracking:** Automatically calculates the **Required Daily Velocity** needed to finish the sprint on time, excluding weekends (Working Days only).
- **Workload Balance:** Alphabetical distribution of tickets by owner to identify overloaded team members.
- **Visual Burndown:** A simplified trend line comparing actual work remaining against an ideal linear burndown.
- **Export Ready:** One-click "Export to Image" for easy sharing in Slack, Teams, or Stakeholder reports.

## Tech Stack

- **Tailwind CSS:** Modern, responsive styling with a dark-mode professional aesthetic.
- **Chart.js:** Interactive data visualizations with static data labels.
- **PapaParse:** Robust client-side CSV parsing.
- **html2canvas:** High-resolution dashboard image capture.

## How to Use

1. **Export from Jira:** - Go to your Jira Issue Search.
   - Filter for your **Current Sprint**.
   - Select `Export` > `Export Excel CSV (all fields)` or `Export CSV (current fields)`.
2. **Configure Dashboard:**
   - Open `index.html` in any modern web browser.
   - Set the **Sprint Start Date** and **Sprint End Date** using the calendar pickers.
3. **Upload Data:**
   - Click **Upload Pure CSV** and select your file.
   - The dashboard will instantly populate all metrics and charts.
4. **Export:**
   - Click **Export to Image** to download a PNG version of your current status.
