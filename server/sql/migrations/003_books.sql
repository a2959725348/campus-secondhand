CREATE TABLE IF NOT EXISTS item_books (
 item_id INT UNSIGNED NOT NULL PRIMARY KEY,
 author VARCHAR(100) NOT NULL DEFAULT '',
 publisher VARCHAR(100) NOT NULL DEFAULT '',
 edition VARCHAR(60) NOT NULL DEFAULT '',
 isbn VARCHAR(13) NOT NULL DEFAULT '',
 course VARCHAR(80) NOT NULL DEFAULT '',
 genre ENUM('textbook','exam','reading','other') NOT NULL DEFAULT 'textbook',
 annotation ENUM('none','light','heavy','unknown') NOT NULL DEFAULT 'unknown',
 KEY idx_books_genre (genre),
 KEY idx_books_isbn (isbn),
 FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
