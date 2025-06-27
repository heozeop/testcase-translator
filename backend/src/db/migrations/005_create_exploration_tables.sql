-- Migration 005: Create Exploration Results Tables
-- Creates tables for storing exploration sessions, navigation sequences, page states, and related data

-- Exploration Sessions table
CREATE TABLE IF NOT EXISTS exploration_sessions (
    id VARCHAR(255) PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
    user_id VARCHAR(255),
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    total_duration INTEGER DEFAULT 0,
    settings JSONB NOT NULL DEFAULT '{}',
    summary JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Navigation Sequences table
CREATE TABLE IF NOT EXISTS navigation_sequences (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
    start_url TEXT NOT NULL,
    final_url TEXT,
    navigation_plan JSONB,
    total_duration INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    completion_percentage DECIMAL(5,2) DEFAULT 0,
    metrics JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Page States table
CREATE TABLE IF NOT EXISTS page_states (
    id VARCHAR(255) PRIMARY KEY,
    sequence_id VARCHAR(255) NOT NULL REFERENCES navigation_sequences(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    timestamp TIMESTAMP NOT NULL,
    dom_snapshot TEXT,
    screenshot_path TEXT,
    viewport_size JSONB NOT NULL DEFAULT '{}',
    load_time INTEGER DEFAULT 0,
    http_status INTEGER,
    elements JSONB NOT NULL DEFAULT '[]',
    forms JSONB NOT NULL DEFAULT '[]',
    errors JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Navigation Actions table
CREATE TABLE IF NOT EXISTS navigation_actions (
    id VARCHAR(255) PRIMARY KEY,
    sequence_id VARCHAR(255) NOT NULL REFERENCES navigation_sequences(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    selector TEXT,
    value JSONB,
    url TEXT,
    coordinates JSONB,
    duration INTEGER,
    success BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Collected Inputs table
CREATE TABLE IF NOT EXISTS collected_inputs (
    id VARCHAR(255) PRIMARY KEY,
    sequence_id VARCHAR(255) NOT NULL REFERENCES navigation_sequences(id) ON DELETE CASCADE,
    element_selector TEXT NOT NULL,
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0,
    source VARCHAR(50) NOT NULL CHECK (source IN ('user', 'default', 'inferred', 'fallback')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exploration Results table (final processed results)
CREATE TABLE IF NOT EXISTS exploration_results (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
    cypress_data JSONB NOT NULL DEFAULT '{}',
    raw_data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    generated_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_exploration_sessions_project_id ON exploration_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_exploration_sessions_test_case_id ON exploration_sessions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_exploration_sessions_status ON exploration_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exploration_sessions_start_time ON exploration_sessions(start_time);

CREATE INDEX IF NOT EXISTS idx_navigation_sequences_session_id ON navigation_sequences(session_id);
CREATE INDEX IF NOT EXISTS idx_navigation_sequences_test_case_id ON navigation_sequences(test_case_id);
CREATE INDEX IF NOT EXISTS idx_navigation_sequences_status ON navigation_sequences(status);
CREATE INDEX IF NOT EXISTS idx_navigation_sequences_start_time ON navigation_sequences(start_time);

CREATE INDEX IF NOT EXISTS idx_page_states_sequence_id ON page_states(sequence_id);
CREATE INDEX IF NOT EXISTS idx_page_states_url ON page_states(url);
CREATE INDEX IF NOT EXISTS idx_page_states_timestamp ON page_states(timestamp);

CREATE INDEX IF NOT EXISTS idx_navigation_actions_sequence_id ON navigation_actions(sequence_id);
CREATE INDEX IF NOT EXISTS idx_navigation_actions_type ON navigation_actions(type);
CREATE INDEX IF NOT EXISTS idx_navigation_actions_timestamp ON navigation_actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_navigation_actions_success ON navigation_actions(success);

CREATE INDEX IF NOT EXISTS idx_collected_inputs_sequence_id ON collected_inputs(sequence_id);
CREATE INDEX IF NOT EXISTS idx_collected_inputs_field_name ON collected_inputs(field_name);
CREATE INDEX IF NOT EXISTS idx_collected_inputs_source ON collected_inputs(source);
CREATE INDEX IF NOT EXISTS idx_collected_inputs_timestamp ON collected_inputs(timestamp);

CREATE INDEX IF NOT EXISTS idx_exploration_results_session_id ON exploration_results(session_id);
CREATE INDEX IF NOT EXISTS idx_exploration_results_generated_at ON exploration_results(generated_at);

-- Add comments for documentation
COMMENT ON TABLE exploration_sessions IS 'Stores exploration session metadata and summary information';
COMMENT ON TABLE navigation_sequences IS 'Stores individual navigation sequences within exploration sessions';
COMMENT ON TABLE page_states IS 'Stores page state snapshots captured during navigation';
COMMENT ON TABLE navigation_actions IS 'Stores individual actions performed during navigation';
COMMENT ON TABLE collected_inputs IS 'Stores user inputs collected during exploration';
COMMENT ON TABLE exploration_results IS 'Stores final processed results and Cypress-compatible data';

COMMENT ON COLUMN exploration_sessions.settings IS 'Session configuration including screenshot frequency, timeouts, etc.';
COMMENT ON COLUMN exploration_sessions.summary IS 'Session metrics including total actions, success rate, etc.';
COMMENT ON COLUMN navigation_sequences.navigation_plan IS 'Original navigation plan from test case parser';
COMMENT ON COLUMN navigation_sequences.metrics IS 'Navigation metrics including pages visited, forms completed, etc.';
COMMENT ON COLUMN page_states.elements IS 'Discovered elements on the page';
COMMENT ON COLUMN page_states.forms IS 'Form state information including field values and validation';
COMMENT ON COLUMN page_states.metadata IS 'Additional page metadata including cookies, localStorage, etc.';
COMMENT ON COLUMN navigation_actions.coordinates IS 'Mouse coordinates for click actions';
COMMENT ON COLUMN navigation_actions.metadata IS 'Additional action context like element text, page title, etc.';
COMMENT ON COLUMN collected_inputs.confidence IS 'Confidence score for inferred or default values (0.0-1.0)';
COMMENT ON COLUMN exploration_results.cypress_data IS 'Generated Cypress test suites and configuration';
COMMENT ON COLUMN exploration_results.raw_data IS 'Raw exploration data including screenshots and DOM snapshots';