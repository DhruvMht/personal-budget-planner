-- ============================================================
-- Budget Planner — Database Seed & Sample Initialization File
-- ============================================================
-- Use this file to initialize or reset the database with sample data.
-- Create new accounts via the frontend registration page (/register).
--
-- How to run:
--   Local / XAMPP: mysql -u root budget_planner < database/seed.sql
--   Cloud MySQL:   mysql -h <host> -u <user> -p <dbname> < database/seed.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS budget_planner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE budget_planner;

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS Users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100)   NOT NULL,
  email          VARCHAR(150)   NOT NULL UNIQUE,
  password       VARCHAR(255)   NOT NULL,
  currency       VARCHAR(10)    NOT NULL DEFAULT 'INR',
  salary_date    TINYINT        NOT NULL DEFAULT 1,
  theme          VARCHAR(10)    NOT NULL DEFAULT 'light',
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ExpenseCategory (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  name           VARCHAR(100)   NOT NULL,
  type           ENUM('fixed', 'variable') NOT NULL DEFAULT 'variable',
  CONSTRAINT fk_category_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_category_user_type (user_id, type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Income (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  source         VARCHAR(100)   NOT NULL,
  amount         DECIMAL(12,2)  NOT NULL,
  month          CHAR(7)        NOT NULL, -- YYYY-MM
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_income_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_income_user_month (user_id, month)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Expenses (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  category_id    INT            NOT NULL,
  amount         DECIMAL(12,2)  NOT NULL,
  date           DATE           NOT NULL,
  description    VARCHAR(255)   NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_expense_user     FOREIGN KEY (user_id)     REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT fk_expense_category FOREIGN KEY (category_id) REFERENCES ExpenseCategory(id) ON DELETE CASCADE,
  INDEX idx_expense_user_date (user_id, date),
  INDEX idx_expense_category (category_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Budgets (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  category_id    INT            NOT NULL,
  monthly_limit  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  priority       ENUM('Low','Medium','High','Very High') NOT NULL DEFAULT 'Low',
  CONSTRAINT fk_budget_user     FOREIGN KEY (user_id)     REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_category FOREIGN KEY (category_id) REFERENCES ExpenseCategory(id) ON DELETE CASCADE,
  UNIQUE KEY uq_budget_user_category (user_id, category_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Goals (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  goal_name      VARCHAR(100)   NOT NULL,
  target_amount  DECIMAL(12,2)  NOT NULL,
  saved_amount   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  deadline       DATE           NULL,
  priority       ENUM('Low','Medium','High','Very High') NOT NULL DEFAULT 'Medium',
  CONSTRAINT fk_goal_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_goal_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Investments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  name           VARCHAR(100)   NOT NULL,
  type           VARCHAR(50)    NOT NULL,
  amount         DECIMAL(12,2)  NOT NULL,
  current_value  DECIMAL(12,2)  NULL,
  date           DATE           NOT NULL,
  month          CHAR(7)        NOT NULL,
  notes          VARCHAR(255)   NULL,
  CONSTRAINT fk_investment_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_investment_user_month (user_id, month),
  INDEX idx_investment_user_type (user_id, type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS BillReminders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  name           VARCHAR(100)   NOT NULL,
  amount         DECIMAL(12,2)  NOT NULL,
  due_day        INT            NOT NULL,
  category_id    INT            NULL,
  type           ENUM('fixed', 'variable', 'investment', 'income') DEFAULT 'fixed',
  is_recurring   BOOLEAN        DEFAULT TRUE,
  notes          TEXT           NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reminder_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reminder_category FOREIGN KEY (category_id) REFERENCES ExpenseCategory(id) ON DELETE SET NULL,
  INDEX idx_reminder_user_day (user_id, due_day)
) ENGINE=InnoDB;

-- 2. Clear Existing Data for Clean Seed (Optional reset)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE BillReminders;
TRUNCATE TABLE Investments;
TRUNCATE TABLE Goals;
TRUNCATE TABLE Budgets;
TRUNCATE TABLE Expenses;
TRUNCATE TABLE Income;
TRUNCATE TABLE ExpenseCategory;
TRUNCATE TABLE Users;
SET FOREIGN_KEY_CHECKS = 1;

-- 3. Insert Sample User for Schema Seed Linking
INSERT INTO Users (id, name, email, password, currency, salary_date, theme)
VALUES (1, 'Sample User', 'user@example.com',
        '$2a$10$XmTPgYndjSkePowe7..cIeJtNovBRONYJKuyTMXtyzvGZJ2sq5OYa',
        'INR', 1, 'light');

SET @uid = 1;

-- 4. Default Categories (Fixed Obligations & Variable Spending)
-- Fixed: Rent, Internet, EMI, Insurance
-- Variable: Electricity, Food, Fuel, Shopping, Entertainment, Travel
INSERT INTO ExpenseCategory (id, user_id, name, type) VALUES
  (1,  @uid, 'Rent',          'fixed'),
  (2,  @uid, 'Electricity',   'variable'), 
  (3,  @uid, 'Internet',      'fixed'),
  (4,  @uid, 'EMI',           'fixed'),
  (5,  @uid, 'Insurance',     'fixed'),
  (6,  @uid, 'Food',          'variable'),
  (7,  @uid, 'Fuel',          'variable'),
  (8,  @uid, 'Shopping',      'variable'),
  (9,  @uid, 'Entertainment', 'variable'),
  (10, @uid, 'Travel',        'variable');

-- 5. Monthly Incomes (August 2026 onwards)
INSERT INTO Income (user_id, source, amount, month) VALUES
  (@uid, 'Primary Salary',   52000.00, '2026-08'),
  (@uid, 'Freelance Project',  8000.00, '2026-08'),
  (@uid, 'Primary Salary',   52000.00, '2026-09'),
  (@uid, 'Freelance Project',  8000.00, '2026-09');

-- 6. Sample Expenses (Fixed Commitments & Variable Spending)
INSERT INTO Expenses (user_id, category_id, amount, date, description) VALUES
  (@uid, 1, 15000.00, CURDATE(), 'Monthly apartment rent'),
  (@uid, 2,  1800.00, CURDATE(), 'Electricity power bill'),
  (@uid, 3,  1000.00, CURDATE(), 'High-speed broadband internet'),
  (@uid, 6,  6200.00, CURDATE(), 'Groceries and food supplies'),
  (@uid, 7,  2400.00, CURDATE(), 'Vehicle petrol & fuel');

-- 7. Budgets & Algorithmic Limits
-- Fixed: Rent (30%), EMI (20%), Insurance (5%), Internet (2%)
-- Variable: Food (High), Fuel (Medium), Entertainment (Low)
INSERT INTO Budgets (user_id, category_id, monthly_limit, priority) VALUES
  (@uid, 1, 18000.00, 'Very High'), -- Rent (30% benchmark on 60k)
  (@uid, 4, 12000.00, 'Very High'), -- EMI (20% benchmark on 60k)
  (@uid, 5,  3000.00, 'High'),      -- Insurance (5% benchmark on 60k)
  (@uid, 3,  1200.00, 'High'),      -- Internet (2% benchmark on 60k)
  (@uid, 6,  7000.00, 'High'),      -- Food
  (@uid, 7,  3000.00, 'Medium'),    -- Fuel
  (@uid, 9,  2000.00, 'Low');       -- Entertainment

-- 8. Savings Goals
INSERT INTO Goals (user_id, goal_name, target_amount, saved_amount, deadline, priority) VALUES
  (@uid, 'Emergency Fund (6 Months)', 150000.00, 35000.00, DATE_ADD(CURDATE(), INTERVAL 12 MONTH), 'Very High'),
  (@uid, 'New MacBook Pro',             90000.00, 25000.00, DATE_ADD(CURDATE(), INTERVAL 6 MONTH),  'High'),
  (@uid, 'Europe Vacation',            120000.00, 15000.00, DATE_ADD(CURDATE(), INTERVAL 9 MONTH),  'Medium');

-- 9. Investments Portfolio (Asset Classes & Current Valuations)
INSERT INTO Investments (user_id, name, type, amount, current_value, date, month, notes) VALUES
  (@uid, 'HDFC Top 100 Index Fund',  'Mutual Funds / SIP', 5000.00, 5450.00, CURDATE(), DATE_FORMAT(CURDATE(), '%Y-%m'), 'Monthly SIP'),
  (@uid, 'Nifty 50 Index ETF',       'Stocks / Equities',  4000.00, 4320.00, CURDATE(), DATE_FORMAT(CURDATE(), '%Y-%m'), 'Direct Equity ETF'),
  (@uid, 'Sovereign Gold Bond',      'Gold / SGB',         3000.00, 3250.00, CURDATE(), DATE_FORMAT(CURDATE(), '%Y-%m'), 'RBI Gold Bond Tranche'),
  (@uid, 'Public Provident Fund',    'PPF / EPF / NPS',    2500.00, 2500.00, CURDATE(), DATE_FORMAT(CURDATE(), '%Y-%m'), 'Government PPF Account');

-- 10. Bill Reminders & Calendar Schedule
INSERT INTO BillReminders (user_id, name, amount, due_day, category_id, type, is_recurring, notes) VALUES
  (@uid, 'House Rent',              15000.00,  1, 1,    'fixed',      1, 'Auto-transfer to landlord on 1st'),
  (@uid, 'Home/Car Loan EMI',       10000.00,  5, 4,    'fixed',      1, 'Auto-debit from HDFC Bank on 5th'),
  (@uid, 'Nifty 50 Index Fund SIP',  5000.00, 10, NULL, 'investment', 1, 'Monthly mutual fund SIP on 10th'),
  (@uid, 'Health & Term Insurance',  2500.00, 15, 5,    'fixed',      1, 'Health insurance premium on 15th'),
  (@uid, 'Fiber Broadband Bill',     1000.00, 20, 3,    'fixed',      1, 'Airtel broadband internet on 20th'),
  (@uid, 'Electricity Power Bill',   1800.00, 25, 2,    'variable',   1, 'State electricity power board on 25th');
