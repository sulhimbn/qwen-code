/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
import { type ColorOption } from '../types.js';
import { theme } from '../../../semantic-colors.js';
import { COLOR_OPTIONS } from '../constants.js';

const colorOptions: ColorOption[] = COLOR_OPTIONS;

interface ColorSelectorProps {
  color?: string;
  agentName?: string;
  onSelect: (color: string) => void;
}

/**
 * Color selection with preview.
 */
export function ColorSelector({
  color = 'auto',
  agentName = 'Agent',
  onSelect,
}: ColorSelectorProps) {
  const [selectedColor, setSelectedColor] = useState<string>(color);

  // Update selected color when color prop changes
  useEffect(() => {
    setSelectedColor(color);
  }, [color]);

  const handleSelect = (selectedValue: string) => {
    const colorOption = colorOptions.find(
      (option) => option.id === selectedValue,
    );
    if (colorOption) {
      onSelect(colorOption.name);
    }
  };

  const handleHighlight = (selectedValue: string) => {
    const colorOption = colorOptions.find(
      (option) => option.id === selectedValue,
    );
    if (colorOption) {
      setSelectedColor(colorOption.name);
    }
  };

  const currentColor =
    colorOptions.find((option) => option.name === selectedColor) ||
    colorOptions[0];

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <RadioButtonSelect
          items={colorOptions.map((option) => ({
            key: option.id,
            label: option.name,
            value: option.id,
          }))}
          initialIndex={colorOptions.findIndex(
            (opt) => opt.id === currentColor.id,
          )}
          onSelect={handleSelect}
          onHighlight={handleHighlight}
          isFocused={true}
        />
      </Box>

      <Box flexDirection="row">
        <Text color={theme.text.secondary}>Preview:</Text>
        <Box marginLeft={2}>
          <Text color={currentColor.value}>{` ${agentName} `}</Text>
        </Box>
      </Box>
    </Box>
  );
}
