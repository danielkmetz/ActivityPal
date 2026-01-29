
import { StyleSheet } from "react-native";

const styles = StyleSheet.create({
  // ---- Modal shell ----
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },

  sheet: {
    zIndex: 2,
    elevation: 30,
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "88%",
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
  },

  scroll: { width: "100%" },

  // Leave room because footer is sticky
  scrollContent: { paddingBottom: 100, paddingTop: 6 },

  loadingContainer: { paddingVertical: 44, alignItems: "center" },

  // ---- Typography ----
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
    color: "#0F172A",
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    color: "#0F172A",
    letterSpacing: 0.2,
  },

  optionHint: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 6,
    fontWeight: "600",
  },

  validationText: {
    marginTop: 10,
    color: "#B00020",
    fontWeight: "800",
  },

  // ---- Cards (major grouping) ----
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6EAF2",
  },

  cardHeader: {
    marginBottom: 10,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },

  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },

  // Inside-card “sections” with tighter rhythm
  sectionTight: {
    marginTop: 8,
  },

  // Legacy section (still used by some older components)
  section: { marginTop: 12 },

  // ---- Layout helpers ----
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rowLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },

  // ---- Chips ----
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    marginRight: 8,
    marginBottom: 8,
  },

  chipSelected: {
    backgroundColor: "#E8F2FF",
    borderColor: "#2196F3",
  },

  chipText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "700",
  },

  chipTextSelected: {
    color: "#0B5CAD",
  },

  // ---- Toggles ----
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },

  // ---- Pickers / Inputs ----
  pickerButton: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },

  // compact picker used in row layouts
  pickerButtonCompact: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    minWidth: 140,
    alignItems: "center",
  },

  placeholderText: { color: "#94A3B8", fontWeight: "700" },
  selectedText: { color: "#0F172A", fontWeight: "800" },

  textInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },

  slider: { width: "100%", height: 44 },

  // ---- Advanced toggle ----
  advancedToggleWrap: {
    marginTop: 2,
    marginBottom: 10,
  },

  advancedToggleBtn: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },

  advancedToggleText: {
    fontWeight: "900",
    color: "#0F172A",
  },

  // ---- Footer (sticky) ----
  footerSticky: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EAF2",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  footerRow: {
    flexDirection: "row",
    marginTop: 16,
    alignItems: "center",
  },

  footerBtnSpacer: { width: 10 },

  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  secondaryBtnText: { fontWeight: "900", color: "#334155" },

  primaryBtn: {
    flex: 1.7,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#2196F3",
  },

  primaryBtnDisabled: { opacity: 0.45 },

  primaryBtnText: { color: "white", fontWeight: "900" },
});

export default styles;
