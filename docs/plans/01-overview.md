# Artilligence — Project Overview

## Company
**Artilligence Technology Private Limited**

## What Is This?
A product-based MLM (Multi-Level Marketing) web application for an Exide battery distributor who wants to build a network of sub-sellers.

Members join via referral links, sell Exide batteries offline, log their sales in the app using MyBillBook bill codes, and earn commissions from their downline's sales up to 7 levels deep.

## Core Concepts

### Ternary Tree
Each member can have a maximum of **3 direct children**. New members are placed using **BFS spillover** (auto-fill left-to-right, top-to-bottom) to keep the tree balanced.

- **Sponsor**: The person who referred the new member (tracked separately)
- **Placement Parent**: The position in the tree where the member is placed (determined by spillover algorithm)

### Product-Based
- Members sell physical Exide batteries (car, inverter, bike, etc.)
- Admin can add/edit/delete products at any time
- Commissions are calculated on **sale amount (INR)**, not on specific products
- The MLM chain works identically regardless of which product is sold

### Offline Sales + Online Tracking
- Battery sales happen **offline** (in-person, phone, etc.)
- Billing happens in **MyBillBook** (external app, no API)
- Members manually log sales in the MLM app with the bill code from MyBillBook
- Admin approves/rejects each sale before commissions are calculated

### No Payment Gateway
- All money moves **offline** (cash, bank transfer, etc.)
- The app only **tracks** earnings — it does not process payments
- Admin marks payouts as "paid" after handing over cash

## Users

### Admin (Single)
- English-only interface
- Full control: products, members, sales approval, commissions, wallets, reports
- Can change commission percentages at any time

### Members
- Join via referral link only
- English + Hindi interface
- Submit sales, view wallet, view downline tree, share referral link
- Cannot self-purchase

## Key Numbers
- **Currency**: INR (₹)
- **Max children per member**: 3
- **Commission depth**: 7 levels
- **Sign-up fee**: ₹0 (none)
- **Placement**: Automatic BFS spillover
