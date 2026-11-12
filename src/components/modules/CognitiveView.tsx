/**
 * ASTRA Health - Unified NEURO-LAB Progressive Cognitive Testing System
 * Re-exports the full NeuroLabView cognitive assessment suite.
 */

import React from 'react';
import { NeuroLabView } from './neurolab/NeuroLabView';
import { CognitiveTaskResult, HealthMeasurement, MetricBaseline } from '../../types/health';

interface CognitiveViewProps {
  sol: number;
  currentHealth?: HealthMeasurement;
  baselines?: MetricBaseline[];
  onRecordCognitiveResult: (result: Omit<CognitiveTaskResult, 'id' | 'timestamp' | 'sol'>) => Promise<void>;
  onAskAstra: (prompt: string) => void;
  onNavigateBack?: () => void;
}

export const CognitiveView: React.FC<CognitiveViewProps> = (props) => {
  return <NeuroLabView {...props} />;
};
