import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSubmissionSchema, insertTrackedTargetSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Mock API routes for rank monitoring
  
  // Get rank series data
  app.get("/api/mock/rank/series", async (req, res) => {
    try {
      const { target_id, range = "30d" } = req.query;
      if (!target_id || typeof target_id !== "string") {
        return res.status(400).json({ message: "target_id is required" });
      }
      
      const data = await storage.getRankSeries(target_id, range as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank series" });
    }
  });

  // Get rank comparison data
  app.get("/api/mock/rank/compare", async (req, res) => {
    try {
      const { targets, range = "30d" } = req.query;
      if (!targets) {
        return res.status(400).json({ message: "targets parameter is required" });
      }
      
      const targetIds = Array.isArray(targets) ? targets as string[] : [targets as string];
      const data = await storage.getRankCompare(targetIds, range as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank comparison" });
    }
  });

  // Get rank history
  app.get("/api/mock/rank/history", async (req, res) => {
    try {
      const { target_id, period = "30d" } = req.query;
      if (!target_id || typeof target_id !== "string") {
        return res.status(400).json({ message: "target_id is required" });
      }
      
      const data = await storage.getRankHistory(target_id, period as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank history" });
    }
  });

  // Start rank check
  app.post("/api/mock/rank/check", async (req, res) => {
    try {
      const { targetIds } = req.body;
      if (!targetIds || !Array.isArray(targetIds)) {
        return res.status(400).json({ message: "targetIds array is required" });
      }
      
      // Simulate rank check process
      res.json({ 
        message: "Rank check started", 
        targetIds,
        estimatedTime: "2-5 minutes" 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to start rank check" });
    }
  });

  // Get events
  app.get("/api/mock/rank/events", async (req, res) => {
    try {
      const { target_id, range = "30d" } = req.query;
      const data = await storage.getEvents(target_id as string, range as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Get alerts
  app.get("/api/mock/alerts", async (req, res) => {
    try {
      const { seen } = req.query;
      const data = await storage.getAlerts(seen === "true" ? true : seen === "false" ? false : undefined);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  // Mark alert as seen
  app.post("/api/mock/alerts/:id/seen", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markAlertSeen(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark alert as seen" });
    }
  });

  // Get submissions
  app.get("/api/mock/submissions", async (req, res) => {
    try {
      const { status } = req.query;
      const data = await storage.getSubmissions(status as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // Create submission
  app.post("/api/mock/submissions", async (req, res) => {
    try {
      const validatedData = insertSubmissionSchema.parse(req.body);
      const submission = await storage.createSubmission(validatedData);
      res.status(201).json(submission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid submission data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create submission" });
    }
  });

  // Approve/reject submission
  app.post("/api/mock/submissions/:id/:action", async (req, res) => {
    try {
      const { id, action } = req.params;
      const { comment } = req.body;
      
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "Action must be 'approve' or 'reject'" });
      }
      
      const status = action === "approve" ? "approved" : "rejected";
      const submission = await storage.updateSubmissionStatus(id, status, comment);
      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: "Failed to update submission" });
    }
  });

  // Get tracked targets
  app.get("/api/mock/targets", async (req, res) => {
    try {
      const { owner } = req.query;
      const data = await storage.getTrackedTargets(owner as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tracked targets" });
    }
  });

  // Create tracked target
  app.post("/api/mock/targets", async (req, res) => {
    try {
      const validatedData = insertTrackedTargetSchema.parse(req.body);
      const target = await storage.createTrackedTarget(validatedData);
      res.status(201).json(target);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid target data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create target" });
    }
  });

  // Update tracked target
  app.patch("/api/mock/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const target = await storage.updateTrackedTarget(id, updates);
      res.json(target);
    } catch (error) {
      res.status(500).json({ message: "Failed to update target" });
    }
  });

  // Delete tracked target
  app.delete("/api/mock/targets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTrackedTarget(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete target" });
    }
  });

  // Get settings
  app.get("/api/mock/settings", async (req, res) => {
    try {
      const data = await storage.getSettings();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Update settings
  app.post("/api/mock/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "key and value are required" });
      }
      
      const setting = await storage.updateSetting(key, value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Analytics endpoints
  app.get("/api/mock/analytics/kpis", async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const data = await storage.getKPIData(period as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KPI data" });
    }
  });

  app.get("/api/mock/analytics/distribution", async (req, res) => {
    try {
      const data = await storage.getRankDistribution();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rank distribution" });
    }
  });

  app.get("/api/mock/analytics/movers", async (req, res) => {
    try {
      const { direction = "up", limit = "10" } = req.query;
      const data = await storage.getTopMovers(direction as "up" | "down", parseInt(limit as string));
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch top movers" });
    }
  });

  app.get("/api/mock/analytics/heatmap", async (req, res) => {
    try {
      const { period = "90d" } = req.query;
      const data = await storage.getHeatmapData(period as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch heatmap data" });
    }
  });

  app.get("/api/mock/analytics/competitors", async (req, res) => {
    try {
      const { target_id } = req.query;
      if (!target_id) {
        return res.status(400).json({ message: "target_id is required" });
      }
      
      const data = await storage.getCompetitorAnalysis(target_id as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch competitor analysis" });
    }
  });

  // Reviews endpoints
  app.get("/api/mock/reviews/rankings", async (req, res) => {
    try {
      const { product_key } = req.query;
      if (!product_key) {
        return res.status(400).json({ message: "product_key is required" });
      }
      
      const data = await storage.getReviewRankings(product_key as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch review rankings" });
    }
  });

  app.get("/api/mock/reviews/health", async (req, res) => {
    try {
      const { product_key } = req.query;
      if (!product_key) {
        return res.status(400).json({ message: "product_key is required" });
      }
      
      const data = await storage.getReviewHealth(product_key as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch review health" });
    }
  });

  app.get("/api/mock/reviews/abuse", async (req, res) => {
    try {
      const { product_key } = req.query;
      if (!product_key) {
        return res.status(400).json({ message: "product_key is required" });
      }
      
      const data = await storage.getAbuseDetection(product_key as string);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch abuse detection" });
    }
  });

  // Export endpoints
  app.post("/api/mock/exports", async (req, res) => {
    try {
      const config = req.body;
      const job = await storage.createExportJob(config);
      res.status(201).json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to create export job" });
    }
  });

  app.get("/api/mock/exports", async (req, res) => {
    try {
      const jobs = await storage.getExportJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch export jobs" });
    }
  });

  app.get("/api/mock/exports/:id/download", async (req, res) => {
    try {
      const { id } = req.params;
      const download = await storage.getExportDownload(id);
      
      res.setHeader('Content-Type', download.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
      res.send(download.data);
    } catch (error) {
      res.status(500).json({ message: "Failed to download export" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
