// Incident Analysis A2A Agent
// Analyzes incidents by searching a local corpus of documents
// Deploy to Railway — set Agent Card URL in ServiceNow to: https://YOUR-PROJECT.up.railway.app/.well-known/agent.json

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

// ── CORS (ServiceNow needs this) ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, A2A-Version');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── EMBEDDING & VECTOR SEARCH ────────────────────────────────────────────────
// Simple TF-IDF + cosine similarity for document matching (no external API)

class DocumentCorpus {
  constructor() {
    this.documents = [];
    this.vocabulary = new Set();
    this.vectorCache = {};
  }

  // Load documents from /corpus folder
  loadCorpus(corpusPath) {
    if (!fs.existsSync(corpusPath)) {
      console.log(`Corpus folder not found at ${corpusPath}, using empty corpus`);
      return;
    }

    const files = fs.readdirSync(corpusPath);
    files.forEach(file => {
      if (file.endsWith('.txt')) {
        const filePath = path.join(corpusPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        this.documents.push({
          name: file,
          content: content,
          tokens: this.tokenize(content)
        });
        this.vocabulary = new Set([...this.vocabulary, ...this.documents[this.documents.length - 1].tokens]);
      }
    });

    console.log(`Loaded ${this.documents.length} documents from corpus`);
  }

  // Simple tokenization
  tokenize(text) {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(token => token.length > 2) // ignore short tokens
      .map(token => token.replace(/[^\w]/g, ''));
  }

  // Compute TF-IDF vector for a document
  getTFIDFVector(tokens) {
    const vector = {};
    const docFreq = {};

    // Count term frequencies in this document
    tokens.forEach(token => {
      vector[token] = (vector[token] || 0) + 1;
    });

    // Normalize by document length and apply IDF
    const docLength = tokens.length;
    Object.keys(vector).forEach(token => {
      // Count how many documents contain this token
      const docsWithToken = this.documents.filter(doc => doc.tokens.includes(token)).length;
