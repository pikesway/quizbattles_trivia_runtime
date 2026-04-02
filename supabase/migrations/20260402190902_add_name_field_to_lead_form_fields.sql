/*
  # Add name field to lead form fields

  ## Overview
  This migration adds the missing "name" property to all lead form field configurations.
  The "name" property is used as the key for storing form data and must be unique for each field.

  ## Changes
  1. Update all existing shells to add the "name" property to their lead form fields
  2. Update the default config for new shells to include the "name" property

  ## Notes
  - The "name" property defaults to the field's "type" value (e.g., "name", "email", "phone")
  - This is a data fix for existing shells that were created without this property
*/

-- Update existing shells to add the "name" property to lead form fields
DO $$
DECLARE
  shell_record RECORD;
  updated_config jsonb;
  fields_array jsonb;
  field_item jsonb;
  updated_fields jsonb[];
BEGIN
  FOR shell_record IN 
    SELECT id, config 
    FROM trivia_shells 
    WHERE config->'screens'->'lead'->'fields' IS NOT NULL
  LOOP
    fields_array := shell_record.config->'screens'->'lead'->'fields';
    updated_fields := ARRAY[]::jsonb[];
    
    FOR i IN 0..jsonb_array_length(fields_array) - 1 LOOP
      field_item := fields_array->i;
      
      -- Add "name" property if it doesn't exist, using "type" as the default value
      IF field_item->>'name' IS NULL THEN
        field_item := field_item || jsonb_build_object('name', field_item->>'type');
      END IF;
      
      updated_fields := array_append(updated_fields, field_item);
    END LOOP;
    
    -- Update the config with the modified fields array
    updated_config := shell_record.config;
    updated_config := jsonb_set(
      updated_config,
      '{screens,lead,fields}',
      to_jsonb(updated_fields)
    );
    
    UPDATE trivia_shells 
    SET config = updated_config 
    WHERE id = shell_record.id;
  END LOOP;
END $$;

-- Update the default config for new shells
ALTER TABLE trivia_shells ALTER COLUMN config DROP DEFAULT;

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
        { "type": "name", "name": "name", "label": "Name", "placeholder": "Enter your name", "required": true, "enabled": true },
        { "type": "email", "name": "email", "label": "Email", "placeholder": "Enter your email", "required": true, "enabled": true },
        { "type": "phone", "name": "phone", "label": "Phone", "placeholder": "10 digit phone number", "required": false, "enabled": false }
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
