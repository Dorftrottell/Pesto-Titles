#!/usr/bin/env python3
"""
Pesto Captions — Launcher
Doppelklick oder: python3 run.py
"""
import subprocess
import sys
import os

src = os.path.join(os.path.dirname(__file__), "src", "main.py")
subprocess.run([sys.executable, src], check=True)
