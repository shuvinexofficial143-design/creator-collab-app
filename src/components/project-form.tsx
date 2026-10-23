import { ActionForm } from "./action-form";
import { mutate } from "@/app/workspace/actions";
import { formatISTInput } from "@/lib/ist-datetime";
export type Project = {
  id: string;
  title: string;
  description: string;
  kind: string;
  payment_paise: number;
  instructions: string;
  language: string;
  usage_terms: string;
  capacity: number;
  deadline: string;
  status: string;
  details?: Record<string, string | number | boolean>;
};
export function ProjectForm({
  project,
  script = "",
}: {
  project?: Project;
  script?: string;
}) {
  return (
    <ActionForm
      action={mutate.bind(null, "project")}
      label={project ? "Save changes" : "Create project"}
    >
      <input type="hidden" name="target" value={project?.id || ""} />
      <div className="grid two">
        <label>
          Project title
          <input
            name="title"
            defaultValue={project?.title}
            required
            minLength={3}
            maxLength={160}
          />
        </label>
        <label>
          Project type
          <select name="kind" defaultValue={project?.kind || "PRODUCT"}>
            <option value="PRODUCT">Product video</option>
            <option value="VOICE">Voice over</option>
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          name="description"
          defaultValue={project?.description}
          required
          minLength={10}
          maxLength={5000}
        />
      </label>
      <div className="grid three">
        {/* Existing SQL schema still requires a numeric value; private projects do not track payments. */}
        <input type="hidden" name="payment_rupees" value={project ? project.payment_paise / 100 : 0} />
        <input type="hidden" name="capacity" value={project?.capacity || 1} />
        <label>
          Application deadline (IST)
          <input
            name="deadline"
            type="datetime-local"
            required
            defaultValue={formatISTInput(project?.deadline)}
          />
        </label>
      </div>
      <label>
        Recording instructions
        <textarea
          name="instructions"
          defaultValue={project?.instructions}
          maxLength={10000}
        />
      </label>
      <label>
        Language
        <input
          name="language"
          defaultValue={project?.language || "Hindi"}
          maxLength={80}
        />
      </label>
      <label>
        Private assigned script
        <textarea name="script" defaultValue={script} maxLength={50000} />
        <small>Only admins and assigned creators can read this script.</small>
      </label>
      <label>
        Content usage and revision terms
        <textarea
          name="usage_terms"
          required
          minLength={5}
          maxLength={5000}
          defaultValue={project?.usage_terms}
        />
      </label>
      <div className="grid two">
        <label>
          Category
          <input
            name="category"
            defaultValue={String(project?.details?.category || "")}
            maxLength={100}
          />
        </label>
        <label>
          Product value (₹)
          <input
            name="product_value"
            type="number"
            min="0"
            max="1000000"
            defaultValue={Number(project?.details?.product_value || 0)}
          />
        </label>
        <label>
          Estimated duration (seconds)
          <input
            name="duration_seconds"
            type="number"
            min="1"
            max="36000"
            required
            defaultValue={Number(project?.details?.duration_seconds || 60)}
          />
        </label>
        <label>
          Delivery deadline (IST)
          <input
            name="delivery_deadline"
            type="datetime-local"
            required
            defaultValue={formatISTInput(String(project?.details?.delivery_deadline || ""))}
          />
        </label>
        <label>
          Voice tone
          <input
            name="voice_tone"
            defaultValue={String(
              project?.details?.voice_tone || "Warm, natural",
            )}
            maxLength={200}
          />
        </label>
        <label>
          Audio format
          <select
            name="audio_format"
            defaultValue={String(project?.details?.audio_format || "MP3")}
          >
            {["MP3", "WAV", "M4A", "OGG"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Included revisions
          <input
            name="revision_limit"
            type="number"
            min="0"
            max="20"
            defaultValue={Number(project?.details?.revision_limit ?? 1)}
          />
        </label>
        <label>
          YouTube reference video URL
          <input
            name="reference_url"
            type="url"
            defaultValue={String(project?.details?.reference_url || "")}
          />
        </label>
      </div>
      <label className="check">
        <input
          name="shipping_required"
          type="checkbox"
          defaultChecked={project?.details?.shipping_required !== false}
        />
        Product shipping required
      </label>
      <label>
        Availability
        <select name="status" defaultValue={project?.status || "DRAFT"}>
          {["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <small>
        Project type is fixed after creation. Accepted project terms remain locked.
      </small>
    </ActionForm>
  );
}
