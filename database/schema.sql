CREATE TABLE IF NOT EXISTS financeiro_data (
    id INT PRIMARY KEY,
    data_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO financeiro_data (id, data_json) VALUES (
    1,
    '{"accounts":[],"creditCards":[],"transactions":[],"categories":[],"budgets":[]}'
);
