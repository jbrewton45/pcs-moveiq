import { useNavigate } from "react-router-dom";

export function MoreView() {
  const navigate = useNavigate();

  return (
    <section className="stacked-view">
      <div className="project-form more-grid">
        <h2>More Tools</h2>
        <button className="more-link" type="button" onClick={() => navigate("/pricing")}>
          Pricing Analysis
        </button>
        <button className="more-link" type="button" onClick={() => navigate("/settings")}>
          Provider Settings
        </button>
      </div>
    </section>
  );
}
