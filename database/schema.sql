CREATE DATABASE IF NOT EXISTS barangaylink
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE barangaylink;

CREATE TABLE IF NOT EXISTS users (
  user_id            INT AUTO_INCREMENT PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NOT NULL,
  role               ENUM('resident','admin') NOT NULL DEFAULT 'resident',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  termination_reason VARCHAR(255) NULL,
  date_created       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residents (
  resident_id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id              INT NOT NULL UNIQUE,
  last_name            VARCHAR(100) NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  birthdate            DATE NOT NULL,
  address              VARCHAR(255) NOT NULL,
  contact_no           VARCHAR(20),
  id_file_path         VARCHAR(255) NULL,
  verification_status  ENUM('Unverified','Pending','Verified','Rejected')
                       NOT NULL DEFAULT 'Unverified',
  verification_remarks VARCHAR(255) NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS document_types (
  document_type_id INT AUTO_INCREMENT PRIMARY KEY,
  document_name    VARCHAR(100) NOT NULL,
  description      VARCHAR(255),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS document_requests (
  request_id       INT AUTO_INCREMENT PRIMARY KEY,
  resident_id      INT NOT NULL,
  document_type_id INT NOT NULL,
  purpose          VARCHAR(255) NOT NULL,
  status           ENUM('Pending','Processing','Ready for Pickup',
                        'Completed','Denied','Cancelled')
                   NOT NULL DEFAULT 'Pending',
  admin_notes      VARCHAR(255) NULL,
  processed_by     INT NULL,
  requested_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (resident_id)      REFERENCES residents(resident_id),
  FOREIGN KEY (document_type_id) REFERENCES document_types(document_type_id),
  FOREIGN KEY (processed_by)     REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS facilities (
  facility_id   INT AUTO_INCREMENT PRIMARY KEY,
  facility_name VARCHAR(100) NOT NULL,
  description   VARCHAR(255),
  capacity      INT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS reservations (
  reservation_id      INT AUTO_INCREMENT PRIMARY KEY,
  resident_id         INT NOT NULL,
  facility_id         INT NOT NULL,
  reservation_date    DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  purpose             VARCHAR(255) NOT NULL,
  equipment_needs     VARCHAR(255) NULL,
  supporting_doc_path VARCHAR(255) NULL,
  status              ENUM('Pending','Approved','Rejected','Cancelled')
                      NOT NULL DEFAULT 'Pending',
  admin_notes         VARCHAR(255) NULL,
  processed_by        INT NULL,
  requested_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (resident_id)  REFERENCES residents(resident_id),
  FOREIGN KEY (facility_id)  REFERENCES facilities(facility_id),
  FOREIGN KEY (processed_by) REFERENCES users(user_id),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  message         VARCHAR(255) NOT NULL,
  link            VARCHAR(255) NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  date_created    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Starting data (run on a fresh database only)
INSERT INTO document_types (document_name, description) VALUES
  ('Barangay Clearance',       'General-purpose barangay clearance'),
  ('Certificate of Residency', 'Proof of residence in the barangay'),
  ('Certificate of Indigency', 'Proof of indigent status');

INSERT INTO facilities (facility_name, description, capacity) VALUES
  ('Covered court', 'Multi-purpose court; chairs on request', 100),
  ('Meeting room',  'Indoor meeting room', 30);