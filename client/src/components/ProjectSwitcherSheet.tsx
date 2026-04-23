import { BottomSheet } from "./ui/BottomSheet";
import { ProjectList } from "./ProjectList";
import { useActiveProject } from "../context/ActiveProjectContext";

interface ProjectSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  onSwitched?: (projectId: string) => void;
}

export function ProjectSwitcherSheet({ open, onClose, refreshKey = 0, onSwitched }: ProjectSwitcherSheetProps) {
  const { setActiveProjectId } = useActiveProject();
  return (
    <BottomSheet open={open} title="Switch active move" onClose={onClose}>
      <ProjectList
        refreshKey={refreshKey}
        onSelect={(projectId) => {
          setActiveProjectId(projectId);
          onSwitched?.(projectId);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
