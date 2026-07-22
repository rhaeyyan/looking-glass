"""Deterministic scoring layer for Looking Glass's Arbitrage Score.

See specs/002-arbitrage-score.md for the full plan. This package computes the
demand x scarcity arbitrage score from an already-joined `SkillCoreRow` — no ingestion, no
LLM calls, no network/DB access.
"""
