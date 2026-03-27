/*
  # Update Lead Screen to Form-Based Configuration
  
  ## Overview
  This migration updates the lead screen configuration from a simple text screen
  to a dynamic form-based system with configurable fields, terms, and validation.
  
  ## Changes
  
  ### trivia_shells.config default structure
  The `screens.lead` section is replaced from:
  ```json
  {
    "headline": "One More Step",
    "body": "Enter your details to continue",
    "button_label": "Continue"
  }
  ```
  
  To the new form configuration:
  ```json
  {
    "headline": "Complete Your Entry",
    "fields": [
      { "type": "name", "label": "Name", "placeholder": "Enter your name", "required": true, "enabled": true },
      { "type": "email", "label": "Email", "placeholder": "Enter your email", "required": true, "enabled": true },
      { "type": "phone", "label": "Phone", "placeholder": "10 digit phone number", "required": false, "enabled": false }
    ],
    "terms": {
      "enabled": true,
      "text": "By submitting your information you agree to receive promotional communications",
      "required": true
    },
    "submit_label": "Submit"
  }
  ```
  
  ## Supported Field Types (v1)
  - name: Single text input for full name
  - email: Email input with format validation
  - phone: Phone number input (10 digits)
  - text: Generic text input for custom fields
  
  ## Notes
  - Existing shells with old format will need manual update or recreation
  - New shells will automatically use the new form-based structure
  - The form supports platform overrides for campaign-level customization
*/

-- Update the default config for new shells to use the form-based lead screen
-- This is done via ALTER COLUMN DEFAULT since we can't easily update JSONB defaults in-place

-- First, drop the existing default
ALTER TABLE trivia_shells ALTER COLUMN config DROP DEFAULT;

-- Set the new default with form-based lead configuration
ALTER TABLE trivia_shells ALTER COLUMN config SET DEFAULT '{
  "theme": {
    "font_family": "Inter",
    "primary_text_color": "#FFFFFF",
    "secondary_text_color": "#A0AEC0",
    "button_fill_color": "#3182CE",
    "button_text_color": "#FFFFFF",
    "overlay_tint": "rgba(0,0,0,0.5)",
    "correct_feedback_accent": "#48BB78",
    "incorrect_feedback_accent": "#F56565"
  },
  "backgrounds": {
    "default": "",
    "start": null,
    "lead": null,
    "game": null,
    "end": null,
    "feedback": null
  },
  "screens": {
    "start": {
      "headline": "Ready to Play?",
      "body": "Test your knowledge!",
      "button_label": "Start Quiz",
      "logo_url": null,
      "disclaimer_text": null
    },
    "lead": {
      "headline": "Complete Your Entry",
      "fields": [
        { "type": "name", "label": "Name", "placeholder": "Enter your name", "required": true, "enabled": true },
        { "type": "email", "label": "Email", "placeholder": "Enter your email", "required": true, "enabled": true },
        { "type": "phone", "label": "Phone", "placeholder": "10 digit phone number", "required": false, "enabled": false }
      ],
      "terms": {
        "enabled": true,
        "text": "By submitting your information you agree to receive promotional communications",
        "required": true
      },
      "submit_label": "Submit"
    },
    "game": {
      "show_progress_bar": true,
      "show_question_number": true
    },
    "end": {
      "headline_template": "You scored {score} out of {total}!",
      "show_score_breakdown": true,
      "cta_placeholder_enabled": false
    },
    "feedback": {
      "correct_headline": "Correct!",
      "incorrect_headline": "Not quite!",
      "show_explanation": true
    }
  },
  "score_range_messages": [
    {"min": 0, "max": 20, "message": "Keep practicing!"},
    {"min": 21, "max": 50, "message": "Good effort!"},
    {"min": 51, "max": 80, "message": "Well done!"},
    {"min": 81, "max": 100, "message": "Excellent!"}
  ]
}'::jsonb;
